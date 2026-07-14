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
  const { data: convo } = await db
    .from("conversations")
    .select("id, org_id, contacts(wa_phone)")
    .eq("id", conversationId)
    .eq("org_id", org.id) // tenant isolation: never send into another org's thread
    .single();

  const waPhone = (convo?.contacts as unknown as { wa_phone: string } | null)?.wa_phone;
  if (!waPhone) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const sent = await sendText(orgWaCredentials(org), waPhone, text);
  if (!sent.ok) {
    return NextResponse.json({ error: "WhatsApp send failed", detail: sent.error }, { status: 502 });
  }

  const { data: message } = await db
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

  // A human replied — take the conversation out of bot mode
  await db
    .from("conversations")
    .update({ status: "open", last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true, message });
}
