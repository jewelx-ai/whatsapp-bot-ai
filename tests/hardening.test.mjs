import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function text(path) {
  return readFileSync(new URL(path, root), "utf8");
}

function json(path) {
  return JSON.parse(text(path));
}

test("Next dependency and transitive security overrides stay pinned", () => {
  const pkg = json("package.json");
  assert.equal(pkg.dependencies.next, "16.2.12");
  assert.equal(pkg.devDependencies["eslint-config-next"], "16.2.12");
  assert.deepEqual(pkg.overrides.next, {
    postcss: "8.5.25",
    sharp: "0.35.3",
  });
});

test("route guard uses proxy.ts instead of deprecated middleware.ts", () => {
  assert.equal(existsSync(new URL("src/proxy.ts", root)), true);
  assert.equal(existsSync(new URL("src/middleware.ts", root)), false);
  assert.match(text("src/proxy.ts"), /export async function proxy/);
});

test("Supabase setup is migration-first and local seed is disabled", () => {
  const config = text("supabase/config.toml");
  assert.match(config, /\[db\.seed\][\s\S]*enabled = false/);
  assert.match(config, /\[db\.seed\][\s\S]*sql_paths = \[\]/);
  assert.match(text("README.md"), /supabase\/migrations|supabase db reset/);
  assert.match(text("docs/06-setup-guide.md"), /supabase\/migrations/);
});

test("worker endpoint is secret-protected and documented", () => {
  const route = text("src/app/api/worker/broadcasts/route.ts");
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /authorization/);
  assert.match(route, /processQueuedBroadcasts/);
  assert.match(text(".env.local.example"), /CRON_SECRET=/);
  assert.match(text("docs/04-api-reference.md"), /\/api\/worker\/broadcasts/);
});

test("analytics route has an RPC fallback and signature-fix migration", () => {
  assert.match(text("src/app/api/analytics/route.ts"), /analyticsFallback/);
  assert.match(
    text("supabase/migrations/20260731000003_dashboard_analytics_signature_fix.sql"),
    /dashboard_analytics\(p_days int, p_org_id uuid\)/
  );
});

test("URL ingestion keeps production hardening controls", () => {
  const route = text("src/app/api/kb/url/route.ts");
  assert.match(route, /KB_INGEST_ALLOWED_HOSTS/);
  assert.match(route, /ALLOWED_CONTENT_TYPES/);
  assert.match(route, /MAX_BYTES/);
  assert.match(route, /MAX_REDIRECTS/);
});

test("WhatsApp settings inputs reject browser login autofill", () => {
  const page = text("src/app/(dashboard)/settings/page.tsx");
  const route = text("src/app/api/settings/route.ts");
  assert.match(page, /wa_phone_number_id_no_autofill/);
  assert.match(page, /wa_cloud_api_token_no_autofill/);
  assert.match(page, /autoComplete="new-password"/);
  assert.match(page, /replace\(\/\\D\/g, ""\)/);
  assert.match(route, /Phone Number ID must contain only digits/);
  assert.match(route, /phone_number_id_in_use/);
  assert.match(route, /no_workspace/);
  assert.match(page, /router\.replace\("\/onboarding"\)/);
});

test("keyword auto-replies still work after human handoff", () => {
  const bot = text("src/lib/bot.ts");
  assert.match(bot, /order\("created_at", \{ ascending: true \}\)/);
  assert.match(bot, /if \(!body && opts\.conversationStatus === "open"\) return null/);
  assert.doesNotMatch(bot, /if \(opts\.conversationStatus === "open"\) return null/);
});

test("auto-reply matching normalizes punctuation and common timing spelling", () => {
  const bot = text("src/lib/bot.ts");
  assert.match(bot, /const INTENT_ALIASES/);
  assert.match(bot, /what price/);
  assert.match(bot, /how much/);
  assert.match(bot, /function normalizeAutoReplyText/);
  assert.match(bot, /tyming\|tymings\|timing\|timings/);
  assert.match(bot, /replace\(\s*\/\[\^\\p\{L\}\\p\{N\}\]\+\/gu, " "\s*\)/);
  assert.match(bot, /split\(\/\[\\n,\|\]\+\//);
  assert.match(text("src/app/(dashboard)/auto-replies/page.tsx"), /price, cost, how much/);
});

test("inbox de-duplicates contacts and exposes chat deletion", () => {
  const inbox = text("src/app/(dashboard)/inbox/page.tsx");
  assert.match(inbox, /uniqueLatestByContact/);
  assert.match(inbox, /deleteChat/);
  assert.match(inbox, /Delete all chat history/);
  assert.match(
    text("supabase/migrations/20260731000005_one_active_conversation_per_contact.sql"),
    /idx_one_active_conversation_per_contact/
  );
});

test("AI can use OpenRouter Gemini Flash-Lite", () => {
  const ai = text("src/lib/ai.ts");
  assert.match(ai, /Provider = "glm" \| "gemini" \| "openrouter"/);
  assert.match(ai, /OPENROUTER_API_KEY/);
  assert.match(ai, /google\/gemini-3\.5-flash-lite/);
  assert.match(ai, /completeWithOpenRouter/);
});

test("failed bot auto-replies are visible in inbox history", () => {
  const bot = text("src/lib/bot.ts");
  const wa = text("src/lib/whatsapp.ts");
  assert.match(bot, /status: sent\.ok \? "sent" : "failed"/);
  assert.match(wa, /131005/);
  assert.match(wa, /"permission"/);
});
