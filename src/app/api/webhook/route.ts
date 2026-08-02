import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAutoReply } from "@/lib/bot";
import { markAsRead, sendText } from "@/lib/whatsapp";
import { getOrgByPhoneNumberId, orgWaCredentials } from "@/lib/org";
import type { Organization } from "@/lib/types";

export const dynamic = "force-dynamic";

// One webhook serves every tenant: Meta includes metadata.phone_number_id in
// each payload, which routes the event to the organization that owns it.

// ---------- GET: Meta webhook verification handshake ----------
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// ---------- POST: incoming messages & status updates ----------
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  try {
    const orgCache = new Map<string, Organization | null>();

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!value || !phoneNumberId) continue;

        // Route the event to its tenant
        if (!orgCache.has(phoneNumberId)) {
          orgCache.set(phoneNumberId, await getOrgByPhoneNumberId(phoneNumberId));
        }
        const org = orgCache.get(phoneNumberId);
        if (!org) {
          console.warn("Webhook for unknown phone_number_id:", phoneNumberId);
          continue;
        }

        // Platform-suspended tenants are ignored (no processing, no auto-reply).
        if (org.suspended) {
          console.warn("Skipping webhook for suspended org:", org.id);
          continue;
        }

        for (const msg of value.messages ?? []) {
          await handleIncomingMessage(org, msg, value.contacts?.[0]);
        }
        for (const status of value.statuses ?? []) {
          await handleStatusUpdate(org, status);
        }
      }
    }
  } catch (err) {
    // Dedupe is atomic (the unique wa_message_id insert gates the reply), so
    // it is safe to signal failure and let Meta retry the batch rather than
    // silently dropping events.
    console.error("Webhook processing error:", err);
    return new NextResponse("Processing error", { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ---------- helpers ----------

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    // Fail closed: never accept unsigned webhooks by default. For local
    // development only, set ALLOW_UNSIGNED_WEBHOOKS=true to opt out explicitly.
    if (process.env.ALLOW_UNSIGNED_WEBHOOKS === "true") {
      console.warn(
        "WHATSAPP_APP_SECRET unset and ALLOW_UNSIGNED_WEBHOOKS=true — skipping signature verification (dev only)"
      );
      return true;
    }
    console.error("WHATSAPP_APP_SECRET is not set — rejecting webhook.");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

async function handleIncomingMessage(
  org: Organization,
  msg: WaMessage,
  contact?: WaContact
) {
  const db = supabaseAdmin();
  const creds = orgWaCredentials(org);
  const waPhone = msg.from;
  const text =
    msg.type === "text"
      ? msg.text?.body ?? ""
      : msg.type === "interactive"
        ? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? ""
        : "";

  // Upsert contact within this tenant
  const { data: contactRow, error: contactErr } = await db
    .from("contacts")
    .upsert(
      {
        org_id: org.id,
        wa_phone: waPhone,
        name: contact?.profile?.name ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "org_id,wa_phone" }
    )
    .select("id")
    .single();
  if (contactErr || !contactRow) {
    throw new Error(`Failed to upsert contact: ${contactErr?.message ?? "missing row"}`);
  }

  // Find or create the conversation
  const { data: existingConversation, error: conversationSelectErr } = await db
    .from("conversations")
    .select("id, status")
    .eq("contact_id", contactRow.id)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversationSelectErr) {
    throw new Error(`Failed to load conversation: ${conversationSelectErr.message}`);
  }
  let conversation = existingConversation;

  if (!conversation) {
    const { data: insertedConversation, error: conversationInsertErr } = await db
      .from("conversations")
      .insert({ org_id: org.id, contact_id: contactRow.id, status: "bot" })
      .select("id, status")
      .single();
    if (conversationInsertErr?.code === "23505") {
      const { data: racedConversation, error: racedConversationErr } = await db
        .from("conversations")
        .select("id, status")
        .eq("contact_id", contactRow.id)
        .neq("status", "closed")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .single();
      if (racedConversationErr || !racedConversation) {
        throw new Error(
          `Failed to load active conversation after conflict: ${
            racedConversationErr?.message ?? "missing row"
          }`
        );
      }
      conversation = racedConversation;
    } else if (conversationInsertErr || !insertedConversation) {
      throw new Error(
        `Failed to create conversation: ${conversationInsertErr?.message ?? "missing row"}`
      );
    } else {
      conversation = insertedConversation;
    }
  }

  const { error: conversationUpdateErr } = await db.from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);
  if (conversationUpdateErr) {
    throw new Error(`Failed to update conversation timestamp: ${conversationUpdateErr.message}`);
  }

  // Store the incoming message. The unique constraint on wa_message_id is the
  // idempotency gate: a redelivered webhook conflicts here (23505) and we skip
  // the auto-reply, so retries never double-send. Other errors propagate so
  // the POST handler can return non-200 and let Meta retry.
  const { error: insertErr } = await db.from("messages").insert({
    org_id: org.id,
    conversation_id: conversation.id,
    direction: "in",
    type: msg.type,
    body: text || `[${msg.type}]`,
    wa_message_id: msg.id,
    status: "received",
  });
  if (insertErr) {
    if (insertErr.code === "23505") return; // duplicate delivery — already handled
    throw new Error(`Failed to store message: ${insertErr.message}`);
  }

  await markAsRead(creds, msg.id).catch(() => {});

  if (text) {
    const consent = consentCommand(text);
    if (consent) {
      const { error: consentErr } = await db
        .from("contacts")
        .update({ opted_in: consent.optedIn })
        .eq("id", contactRow.id)
        .eq("org_id", org.id);
      if (consentErr) {
        throw new Error(`Failed to update contact consent: ${consentErr.message}`);
      }

      const sent = await sendText(creds, waPhone, consent.reply);
      if (sent.ok) {
        const { error: consentMessageErr } = await db.from("messages").insert({
          org_id: org.id,
          conversation_id: conversation.id,
          direction: "out",
          type: "text",
          body: consent.reply,
          wa_message_id: sent.waMessageId,
          status: "sent",
        });
        if (consentMessageErr) {
          throw new Error(`Failed to store consent reply: ${consentMessageErr.message}`);
        }
      }
      return;
    }

    await runAutoReply({
      orgId: org.id,
      creds,
      aiEnabled: org.ai_enabled,
      waPhone,
      conversationId: conversation.id,
      conversationStatus: conversation.status,
      text,
    });
  }
}

function consentCommand(text: string): { optedIn: boolean; reply: string } | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");

  if (["stop", "stop all", "unsubscribe", "cancel", "end", "quit"].includes(normalized)) {
    return {
      optedIn: false,
      reply:
        "You have been unsubscribed from broadcast messages. Reply START to opt back in.",
    };
  }

  if (["start", "subscribe", "unstop"].includes(normalized)) {
    return {
      optedIn: true,
      reply: "You are subscribed again and can receive broadcast messages from us.",
    };
  }

  return null;
}

async function handleStatusUpdate(org: Organization, status: WaStatus) {
  const db = supabaseAdmin();
  const { error } = await db
    .from("messages")
    .update({ status: status.status })
    .eq("org_id", org.id)
    .eq("wa_message_id", status.id);
  if (error) {
    throw new Error(`Failed to update WhatsApp status: ${error.message}`);
  }
}

// ---------- minimal payload types ----------

type WaContact = { wa_id: string; profile?: { name?: string } };
type WaMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  interactive?: {
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
};
type WaStatus = { id: string; status: string; recipient_id: string };
type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: WaContact[];
        messages?: WaMessage[];
        statuses?: WaStatus[];
      };
    }[];
  }[];
};
