import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendText } from "@/lib/whatsapp";
import { generateAIReply } from "@/lib/ai";

const FALLBACK_REPLY =
  "Sorry, I didn't understand that. 🤖 Reply *hi* to see the menu or *help* to talk to a human.";

/**
 * Find a matching auto-reply for the incoming text and send it.
 * Returns the reply that was sent (or null if the conversation is
 * assigned to a human / no reply was sent).
 */
export async function runAutoReply(opts: {
  waPhone: string;
  conversationId: string;
  conversationStatus: string;
  text: string;
}): Promise<string | null> {
  // Don't auto-reply when a human agent has taken over.
  if (opts.conversationStatus === "open") return null;

  const db = supabaseAdmin();
  const incoming = opts.text.trim().toLowerCase();

  const { data: rules } = await db
    .from("auto_replies")
    .select("trigger_keyword, match_type, response_text")
    .eq("active", true);

  let reply: string | null = null;
  for (const rule of rules ?? []) {
    const kw = rule.trigger_keyword.toLowerCase();
    const matched =
      (rule.match_type === "exact" && incoming === kw) ||
      (rule.match_type === "starts_with" && incoming.startsWith(kw)) ||
      (rule.match_type === "contains" && incoming.includes(kw));
    if (matched) {
      reply = rule.response_text;
      // "help" style rules can hand off to a human
      if (kw === "help") {
        await db
          .from("conversations")
          .update({ status: "open" })
          .eq("id", opts.conversationId);
      }
      break;
    }
  }

  let body = reply;

  // No keyword match → try an AI reply before the static fallback
  if (!body) {
    const ai = await generateAIReply(opts.conversationId);
    if (ai) {
      body = ai.text;
      if (ai.handoff) {
        await db
          .from("conversations")
          .update({ status: "open" })
          .eq("id", opts.conversationId);
      }
    }
  }

  body = body ?? FALLBACK_REPLY;
  const sent = await sendText(opts.waPhone, body);

  if (sent.ok) {
    await db.from("messages").insert({
      conversation_id: opts.conversationId,
      direction: "out",
      type: "text",
      body,
      wa_message_id: sent.waMessageId,
      status: "sent",
    });
  }
  return body;
}
