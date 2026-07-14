import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendText } from "@/lib/whatsapp";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1).max(4096),
});

// Manual reply from a logged-in dashboard agent.
export async function POST(req: NextRequest) {
  const auth = await supabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { conversationId, text } = parsed.data;

  const db = supabaseAdmin();
  const { data: convo } = await db
    .from("conversations")
    .select("id, contacts(wa_phone)")
    .eq("id", conversationId)
    .single();

  const waPhone = (convo?.contacts as unknown as { wa_phone: string } | null)?.wa_phone;
  if (!waPhone) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const sent = await sendText(waPhone, text);
  if (!sent.ok) {
    return NextResponse.json({ error: "WhatsApp send failed", detail: sent.error }, { status: 502 });
  }

  const { data: message } = await db
    .from("messages")
    .insert({
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
