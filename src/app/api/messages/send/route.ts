import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendText } from "@/lib/whatsapp";
import { getOrgForCurrentUser, orgWaCredentials } from "@/lib/org";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1).max(4096),
});

// Manual reply from a logged-in dashboard agent, using their org's credentials.
export async function POST(req: NextRequest) {
  const org = await getOrgForCurrentUser();
  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!org.wa_phone_number_id || !org.wa_access_token) {
    return NextResponse.json(
      { error: "WhatsApp is not connected — add credentials in Settings" },
      { status: 409 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { conversationId, text } = parsed.data;

  const db = supabaseAdmin();
  const { data: convo, error: convoErr } = await db
    .from("conversations")
    .select("id, org_id, contacts(wa_phone)")
    .eq("id", conversationId)
    .eq("org_id", org.id) // tenant isolation: never send into another org's thread
    .single();
  if (convoErr) {
    console.error("Could not load conversation for manual send", convoErr);
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const waPhone = (convo?.contacts as unknown as { wa_phone: string } | null)?.wa_phone;
  if (!waPhone) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // sendText already logs provider details server-side; don't leak them here.
  // Each failure cause gets a message the agent can act on, because "send
  // failed" alone leads to pointless retries or replacing a working token.
  let creds;
  try {
    creds = orgWaCredentials(org);
  } catch (err) {
    console.error("Could not decrypt WhatsApp credentials for manual send", err);
    return NextResponse.json(
      { error: "Stored WhatsApp credentials cannot be decrypted." },
      { status: 500 }
    );
  }

  const sent = await sendText(creds, waPhone, text);
  if (!sent.ok) {
    const failures: Record<string, { status: number; error: string }> = {
      auth: {
        status: 409,
        error:
          "WhatsApp rejected the credentials — the access token is expired or invalid. Update it in Settings, then try again.",
      },
      recipient_not_allowed: {
        status: 409,
        error:
          "This number is not in your WhatsApp test number's allowed recipient list. Add it in Meta → WhatsApp → API Setup, or use a live number.",
      },
      outside_window: {
        status: 409,
        error:
          "More than 24 hours have passed since this customer's last message, so a free-form reply is not allowed. Send an approved template from Broadcasts instead.",
      },
      undeliverable: {
        status: 502,
        error:
          "WhatsApp could not deliver this message — the number may not be on WhatsApp.",
      },
      rate_limited: {
        status: 429,
        error: "WhatsApp is rate limiting this number. Wait a moment and try again.",
      },
      invalid_request: {
        status: 502,
        error: "WhatsApp rejected this message as invalid.",
      },
    };

    const mapped = failures[sent.kind ?? "unknown"] ?? {
      status: 502,
      error: "WhatsApp could not deliver this message. Please try again.",
    };
    return NextResponse.json(
      { error: mapped.error, code: `wa_${sent.kind ?? "unknown"}` },
      { status: mapped.status }
    );
  }

  const { data: message, error: messageErr } = await db
    .from("messages")
    .insert({
      org_id: org.id,
      conversation_id: conversationId,
      direction: "out",
      type: "text",
      body: text,
      wa_message_id: sent.waMessageId,
      status: "sent",
    })
    .select()
    .single();
  if (messageErr) {
    console.error("WhatsApp message sent but DB message insert failed", messageErr);
    return NextResponse.json(
      {
        error:
          "WhatsApp accepted the message, but the dashboard could not save it. Refresh before retrying.",
        code: "message_persist_failed",
      },
      { status: 202 }
    );
  }

  // A human replied — take the conversation out of bot mode
  const { error: updateErr } = await db
    .from("conversations")
    .update({ status: "open", last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (updateErr) {
    console.error("Manual send conversation update failed", updateErr);
    return NextResponse.json(
      {
        error:
          "Message was sent and saved, but the conversation status could not be updated.",
        code: "conversation_update_failed",
        message,
      },
      { status: 202 }
    );
  }

  return NextResponse.json({ ok: true, message });
}
