import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendText, type WaCredentials } from "@/lib/whatsapp";
import { generateAIReply } from "@/lib/ai";

const FALLBACK_REPLY =
  "Sorry, I didn't understand that. 🤖 Reply *hi* to see the menu or *help* to talk to a human.";

const INTENT_ALIASES: Record<string, string[]> = {
  price: [
    "price",
    "pricing",
    "cost",
    "fee",
    "fees",
    "rate",
    "rates",
    "how much",
    "what price",
    "price what",
    "price enna",
    "enna price",
    "evlo",
    "evalo",
  ],
  time: [
    "time",
    "timing",
    "timings",
    "tyming",
    "tymings",
    "class time",
    "class timing",
    "class timings",
    "opening time",
    "working time",
    "hours",
    "schedule",
  ],
};

/**
 * Find a matching auto-reply for the incoming text and send it, scoped to
 * one tenant. Returns the reply that was sent. Human-open conversations still
 * allow explicit keyword rules, but skip AI/fallback chatter.
 */
export async function runAutoReply(opts: {
  orgId: string;
  creds: WaCredentials;
  aiEnabled: boolean;
  waPhone: string;
  conversationId: string;
  conversationStatus: string;
  text: string;
}): Promise<string | null> {
  const db = supabaseAdmin();
  const incoming = normalizeAutoReplyText(opts.text);

  const { data: rules } = await db
    .from("auto_replies")
    .select("trigger_keyword, match_type, response_text")
    .eq("org_id", opts.orgId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  let reply: string | null = null;
  for (const rule of rules ?? []) {
    const keywords = keywordVariants(rule.trigger_keyword);
    const matched = keywords.some((kw) =>
      rule.match_type === "exact"
        ? incoming === kw
        : rule.match_type === "starts_with"
          ? incoming.startsWith(kw)
          : incoming.includes(kw)
    );
    if (matched) {
      reply = rule.response_text;
      // "help" style rules hand off to a human
      if (keywords.includes("help")) {
        await db
          .from("conversations")
          .update({ status: "open" })
          .eq("id", opts.conversationId);
      }
      break;
    }
  }

  let body = reply;

  // Once a teammate/AI handoff has opened the conversation, only explicit
  // keyword rules should answer. Avoid AI/fallback replies that keep talking
  // over a human-owned thread.
  if (!body && opts.conversationStatus === "open") return null;

  // No keyword match → try an AI reply before the static fallback
  if (!body && opts.aiEnabled) {
    const ai = await generateAIReply(opts.conversationId, opts.orgId);
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
  const sent = await sendText(opts.creds, opts.waPhone, body);

  await db.from("messages").insert({
    org_id: opts.orgId,
    conversation_id: opts.conversationId,
    direction: "out",
    type: "text",
    body,
    wa_message_id: sent.waMessageId,
    status: sent.ok ? "sent" : "failed",
  });
  return body;
}

function keywordVariants(keyword: string): string[] {
  const base = keyword
    .split(/[\n,|]+/)
    .map(normalizeAutoReplyText)
    .filter(Boolean);
  return [...new Set(base.flatMap((kw) => [kw, ...(INTENT_ALIASES[kw] ?? [])]))];
}

function normalizeAutoReplyText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(tyming|tymings|timing|timings)\b/g, "time")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
