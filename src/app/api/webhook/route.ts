import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAutoReply } from "@/lib/bot";
import { markAsRead } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

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
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        for (const msg of value.messages ?? []) {
          await handleIncomingMessage(msg, value.contacts?.[0]);
        }
        for (const status of value.statuses ?? []) {
          await handleStatusUpdate(status);
        }
      }
    }
  } catch (err) {
    // Log but still return 200 — Meta retries aggressively on non-200
    // and retried deliveries would duplicate messages.
    console.error("Webhook processing error:", err);
  }

  return NextResponse.json({ ok: true });
}

// ---------- helpers ----------

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // allow during local dev; set the secret in prod
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

async function handleIncomingMessage(msg: WaMessage, contact?: WaContact) {
  const db = supabaseAdmin();
  const waPhone = msg.from;
  const text =
    msg.type === "text"
      ? msg.text?.body ?? ""
      : msg.type === "interactive"
        ? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? ""
        : "";

  // Dedupe: Meta may redeliver the same message
  const { data: existing } = await db
    .from("messages")
    .select("id")
    .eq("wa_message_id", msg.id)
    .maybeSingle();
  if (existing) return;

  // Upsert contact
  const { data: contactRow } = await db
    .from("contacts")
    .upsert(
      {
        wa_phone: waPhone,
        name: contact?.profile?.name ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "wa_phone" }
    )
    .select("id")
    .single();
  if (!contactRow) return;

  // Find or create the conversation
  let conversation = (
    await db
      .from("conversations")
      .select("id, status")
      .eq("contact_id", contactRow.id)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ).data;

  if (!conversation) {
    conversation = (
      await db
        .from("conversations")
        .insert({ contact_id: contactRow.id, status: "bot" })
        .select("id, status")
        .single()
    ).data;
  }
  if (!conversation) return;

  await db.from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // Store the incoming message
  await db.from("messages").insert({
    conversation_id: conversation.id,
    direction: "in",
    type: msg.type,
    body: text || `[${msg.type}]`,
    wa_message_id: msg.id,
    status: "received",
  });

  await markAsRead(msg.id).catch(() => {});

  if (text) {
    await runAutoReply({
      waPhone,
      conversationId: conversation.id,
      conversationStatus: conversation.status,
      text,
    });
  }
}

async function handleStatusUpdate(status: WaStatus) {
  const db = supabaseAdmin();
  await db
    .from("messages")
    .update({ status: status.status })
    .eq("wa_message_id", status.id);
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
        contacts?: WaContact[];
        messages?: WaMessage[];
        statuses?: WaStatus[];
      };
    }[];
  }[];
};
