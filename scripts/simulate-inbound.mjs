#!/usr/bin/env node
/**
 * Simulate an inbound WhatsApp message for local testing.
 *
 * Builds a Meta-shaped webhook payload, signs it with WHATSAPP_APP_SECRET
 * exactly as Meta does, and POSTs it to your running dev server. This exercises
 * the real pipeline: signature check → tenant routing → contact/conversation/
 * message storage → keyword or AI reply.
 *
 * Usage:
 *   node scripts/simulate-inbound.mjs "hi"
 *   node scripts/simulate-inbound.mjs "do you ship to Chennai?" 15551230002 "Test Buyer"
 *
 * Args: <text> [fromPhone] [profileName]
 *
 * Notes:
 * - The outbound reply will fail at Meta unless the number is a registered test
 *   recipient. That is expected: storage, routing, and bot decisions are still
 *   exercised, and the attempt is visible in the dev server log.
 * - Requires the dev server running on BASE_URL (default http://localhost:3000).
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const [, , text, fromArg, nameArg] = process.argv;
if (!text) {
  console.error('Usage: node scripts/simulate-inbound.mjs "<message text>" [fromPhone] [name]');
  process.exit(1);
}
const from = fromArg ?? "15551230001";
const profileName = nameArg ?? "Local Tester";

// --- read env ---
// Parse .env.local the way dotenv does: later duplicates win.
const envVars = new Map();
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
  if (m) envVars.set(m[1], m[2].split("#")[0].trim());
}
const get = (key) => envVars.get(key);

const APP_SECRET = get("WHATSAPP_APP_SECRET");
const SUPABASE_URL = get("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = get("SUPABASE_SERVICE_ROLE_KEY");

if (!APP_SECRET || APP_SECRET.startsWith("your-")) {
  console.error(
    "WHATSAPP_APP_SECRET is not set in .env.local — the webhook now fails closed.\n" +
      "Set the real app secret, or set ALLOW_UNSIGNED_WEBHOOKS=true for local dev."
  );
  process.exit(1);
}

// --- find the workspace that owns a WhatsApp number ---
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const { data: org, error: orgErr } = await db
  .from("organizations")
  .select("id, name, wa_phone_number_id, ai_enabled, suspended")
  .not("wa_phone_number_id", "is", null)
  .limit(1)
  .maybeSingle();

if (orgErr) {
  console.error("Could not read organizations:", orgErr.message);
  process.exit(1);
}
if (!org) {
  console.error("No workspace has a WhatsApp Phone Number ID yet. Set one in /settings.");
  process.exit(1);
}

console.log(`workspace : ${org.name}`);
console.log(`ai_enabled: ${org.ai_enabled}   suspended: ${org.suspended}`);
console.log(`from      : ${from} (${profileName})`);
console.log(`text      : ${text}`);

// --- build + sign the payload ---
const waMessageId = `wamid.SIM_${Date.now()}`;
const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "SIMULATED_WABA",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15550000000",
              phone_number_id: org.wa_phone_number_id,
            },
            contacts: [{ wa_id: from, profile: { name: profileName } }],
            messages: [
              {
                id: waMessageId,
                from,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
};

const raw = JSON.stringify(payload);
const signature =
  "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(raw).digest("hex");

// --- send it ---
let res;
try {
  res = await fetch(`${BASE_URL}/api/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hub-signature-256": signature },
    body: raw,
  });
} catch (e) {
  console.error(`\nCould not reach ${BASE_URL} — is "npm run dev" running?`);
  console.error(e.message);
  process.exit(1);
}

console.log(`\nwebhook   : HTTP ${res.status} ${await res.text()}`);

// --- show what landed in the database ---
await new Promise((r) => setTimeout(r, 1500));

const { data: contact } = await db
  .from("contacts")
  .select("id, name")
  .eq("org_id", org.id)
  .eq("wa_phone", from)
  .maybeSingle();

if (!contact) {
  console.log("stored    : no contact found (check the dev server log)");
  process.exit(0);
}

const { data: convo } = await db
  .from("conversations")
  .select("id, status")
  .eq("contact_id", contact.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const { data: msgs } = await db
  .from("messages")
  .select("direction, body, status, created_at")
  .eq("conversation_id", convo?.id ?? "")
  .order("created_at", { ascending: true })
  .limit(10);

console.log(`contact   : ${contact.name ?? "—"} (${contact.id})`);
console.log(`conversation status: ${convo?.status}`);
console.log("\nthread:");
for (const m of msgs ?? []) {
  const arrow = m.direction === "in" ? "→" : "←";
  console.log(`  ${arrow} [${m.status}] ${m.body}`);
}
console.log("\nOpen /inbox to see this conversation in the dashboard.");
