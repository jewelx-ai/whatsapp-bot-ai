import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";

// AI replies: when no keyword rule matches and AI is enabled, answer with
// Claude using recent conversation history. Escalates to a human when unsure.

const SYSTEM_PROMPT = `You are a friendly WhatsApp customer support assistant for a small business.

Rules:
- Keep replies short (1-3 sentences) — this is WhatsApp, not email.
- Be warm and helpful. Plain text only: no markdown headers or bullet lists; a WhatsApp *bold* word is fine.
- Answer only from the conversation context. If you don't know something specific to the business (exact prices, stock, order status) or the user is upset or asks for a person, reply with a brief apology and include the exact token [HANDOFF] at the end.
- Never invent facts, prices, or commitments.`;

/**
 * Generate an AI reply from the last messages of a conversation.
 * The per-tenant toggle (organizations.ai_enabled) is checked by the caller;
 * this only requires the platform ANTHROPIC_API_KEY. Returns { text, handoff }
 * or null on any failure (callers fall back to the static reply).
 */
export async function generateAIReply(
  conversationId: string
): Promise<{ text: string; handoff: boolean } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const db = supabaseAdmin();
  const { data: history } = await db
    .from("messages")
    .select("direction, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!history || history.length === 0) return null;

  // Oldest first, mapped to Claude roles; merge consecutive same-role turns
  const turns: Anthropic.MessageParam[] = [];
  for (const m of history.reverse()) {
    if (!m.body) continue;
    const role = m.direction === "in" ? "user" : "assistant";
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n${m.body}`;
    } else {
      turns.push({ role, content: m.body });
    }
  }
  if (turns.length === 0 || turns[0].role !== "user") return null;
  // Conversation must end on the user's message
  while (turns.length && turns[turns.length - 1].role === "assistant") {
    turns.pop();
  }
  if (turns.length === 0) return null;

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: turns,
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return null;

    const handoff = text.includes("[HANDOFF]");
    return { text: text.replace("[HANDOFF]", "").trim(), handoff };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("AI reply failed:", err.status, err.message);
    } else {
      console.error("AI reply failed:", err);
    }
    return null;
  }
}
