import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { retrieveContext } from "@/lib/kb";
import { aiDailyLimitForOrg } from "@/lib/limits";

// AI replies: when no keyword rule matches and AI is enabled, answer from
// recent conversation history and the knowledge base, escalating to a human
// when unsure. Providers are selected by AI_PROVIDER:
//   - "glm"        : GLM models via Z.ai's OpenAI-compatible Chat Completions API.
//   - "gemini"     : Google Gemini via the native generateContent REST endpoint.
//   - "openrouter" : OpenRouter's OpenAI-compatible Chat Completions API.
// Gemini mirrors non-Latin scripts (e.g. Tamil) more reliably; GLM's flashx
// tier is the cheapest. Both fall back to the static reply on any failure.

type Turn = { role: "user" | "assistant"; content: string };
type Provider = "glm" | "gemini" | "openrouter";

// AI_PROVIDER picks the *primary* model. The other provider is used as an
// automatic fallback: a customer must never receive the "I didn't understand"
// static reply just because one vendor rejected a key or rate-limited us.
// (Real incident: Google's new `AQ.`-format keys are intermittently refused by
// the generativelanguage endpoint, which silently downgraded live replies.)
const configuredProvider = (process.env.AI_PROVIDER ?? "glm").toLowerCase();
const PRIMARY_PROVIDER: Provider =
  configuredProvider === "gemini"
    ? "gemini"
    : configuredProvider === "openrouter"
      ? "openrouter"
      : "glm";
const ALL_PROVIDERS: Provider[] = ["glm", "gemini", "openrouter"];
const FALLBACK_PROVIDERS: Provider[] = ALL_PROVIDERS.filter(
  (provider) => provider !== PRIMARY_PROVIDER
);

// --- GLM (Z.ai, OpenAI-compatible) ---
const ZAI_BASE_URL = process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4/";
// Default model chosen from a multilingual grounding/cost benchmark:
// glm-4.7-flashx matched the flagship on quality, was fastest, and ~16x cheaper.
// Override with ZAI_MODEL in the environment.
const GLM_MODEL = process.env.ZAI_MODEL ?? "glm-4.7-flashx";

// --- Gemini (Google, native REST) ---
const GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
// flash-lite is the cost/speed tier; 3.5 is the current stable generation.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

// --- OpenRouter (OpenAI-compatible) ---
const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "google/gemini-3.5-flash-lite";

/** Is a provider usable at all (platform key configured)? */
function hasKey(provider: Provider): boolean {
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  if (provider === "openrouter") return Boolean(process.env.OPENROUTER_API_KEY);
  return Boolean(process.env.ZAI_API_KEY);
}

/**
 * Call GLM via the OpenAI-compatible endpoint. Returns raw assistant text,
 * or null on any failure (so the caller can fall back to the static reply).
 */
async function completeWithGLM(system: string, turns: Turn[]): Promise<string | null> {
  if (!process.env.ZAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: process.env.ZAI_API_KEY, baseURL: ZAI_BASE_URL });
  try {
    const response = await client.chat.completions.create({
      model: GLM_MODEL,
      max_tokens: 1024,
      temperature: 0.6,
      messages: [{ role: "system", content: system }, ...turns],
      // GLM-specific extension: disable extended thinking for fast, short
      // support replies. Sent as an extra field to the Z.ai endpoint.
      thinking: { type: "disabled" },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
    return (response.choices[0]?.message?.content ?? "").trim() || null;
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error("GLM reply failed:", err.status, err.message);
    } else {
      console.error("GLM reply failed:", err);
    }
    return null;
  }
}

/**
 * Call Gemini via the native generateContent endpoint. The API key uses
 * Google's newer format, which authenticates with the x-goog-api-key header
 * (not the ?key= query param). Returns raw assistant text, or null on failure.
 */
async function completeWithGemini(system: string, turns: Turn[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  // Gemini uses "model" for the assistant role and nests text under parts[].
  const contents = turns.map((t) => ({
    role: t.role === "assistant" ? "model" : "user",
    parts: [{ text: t.content }],
  }));
  const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Gemini reply failed:", res.status, detail.slice(0, 200));
      return null;
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    // Concatenate text parts; ignore thought-signature-only parts.
    const text = parts
      .map((p: { text?: string }) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    console.error("Gemini reply failed:", err);
    return null;
  }
}

/**
 * Call OpenRouter via its OpenAI-compatible chat completions endpoint. Returns
 * raw assistant text, or null on failure so another provider can handle it.
 */
async function completeWithOpenRouter(
  system: string,
  turns: Turn[]
): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://wtsapp-bot.vercel.app",
      "X-Title": "WhatsApp Bot",
    },
  });
  try {
    const response = await client.chat.completions.create({
      model: OPENROUTER_MODEL,
      max_tokens: 1024,
      temperature: 0.6,
      messages: [{ role: "system", content: system }, ...turns],
    });
    return (response.choices[0]?.message?.content ?? "").trim() || null;
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error("OpenRouter reply failed:", err.status, err.message);
    } else {
      console.error("OpenRouter reply failed:", err);
    }
    return null;
  }
}

const SYSTEM_PROMPT = `You are a friendly WhatsApp customer support assistant for a small business.

Rules:
- Keep replies short (1-3 sentences) — this is WhatsApp, not email.
- LANGUAGE: always answer in the SAME language and script the customer used in their most recent message. Tamil script → reply in Tamil script; romanised Tamil (Tanglish) or Singlish → reply in that same romanised style, do NOT switch to Tamil script; Chinese → Chinese; Malay → Malay; English → English. Match their mix if they mix languages. Keep knowledge-base facts and proper nouns — addresses, product and model names, prices, phone numbers — exactly as written in the knowledge base, even inside a reply written in another language.
- Be warm and helpful. Plain text only: no markdown headers or bullet lists; a WhatsApp *bold* word is fine.
- Answer from the business knowledge base passages below when they are relevant; otherwise from the conversation.
- CRITICAL: every business-specific fact — address, location, city, phone number, opening hours, prices, stock, warranty, delivery, payment methods, policies — must come verbatim from the knowledge base or from something the customer told you earlier in this conversation. You have no other information about this business.
- If the knowledge base does not contain the answer, never guess or fill in a plausible value. Say you will check with the team and include the exact token [HANDOFF] at the end.
- Also hand off when the customer is upset, asks for a person, or asks about exact stock, order status, bulk or corporate quotes, trade-in valuations, or repair quotations.
- Never invent facts, prices, or commitments. Do not mention "sources", "passages", or the knowledge base itself.`;

// Appended when retrieval returned nothing, so the model cannot silently fall
// back on general world knowledge for business questions.
const NO_CONTEXT_NOTE = `\n\nNo knowledge base passages matched this question. You therefore know nothing about this business's address, hours, prices, stock or policies. Do not state any such fact. If the customer asked for one, apologise briefly, say a colleague will confirm, and end with [HANDOFF].`;

/**
 * Generate an AI reply from the last messages of a conversation.
 * The per-tenant toggle (organizations.ai_enabled) is checked by the caller.
 * Tries the primary provider (AI_PROVIDER) and automatically falls back to the
 * other provider if it fails. Returns { text, handoff }, or null only when every
 * configured provider failed (callers then send the static reply).
 */
export async function generateAIReply(
  conversationId: string,
  orgId: string
): Promise<{ text: string; handoff: boolean } | null> {
  // Primary first, then the other provider as a safety net. Skip any provider
  // whose key is not configured; bail only when none are usable.
  const chain: Provider[] = [PRIMARY_PROVIDER, ...FALLBACK_PROVIDERS].filter(hasKey);
  if (chain.length === 0) return null;

  const db = supabaseAdmin();
  const { data: history } = await db
    .from("messages")
    .select("direction, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!history || history.length === 0) return null;

  // Oldest first, mapped to chat roles; merge consecutive same-role turns
  const turns: Turn[] = [];
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

  // RAG: pull relevant knowledge base passages for the user's latest message
  const lastUserTurn = turns[turns.length - 1];
  const kbContext = await retrieveContext(orgId, String(lastUserTurn.content));
  const system = kbContext
    ? `${SYSTEM_PROMPT}\n\n<knowledge_base>\n${kbContext}\n</knowledge_base>`
    : `${SYSTEM_PROMPT}${NO_CONTEXT_NOTE}`;

  // Per-plan daily quota: atomically count this attempt and bail to the static
  // fallback once the cap is reached. Inactive plans disable AI replies.
  try {
    const limit = await aiDailyLimitForOrg(orgId);
    if (limit === null) {
      console.warn(`AI replies blocked by inactive plan for org ${orgId}`);
      return null;
    }

    const { data: allowed, error } = await db.rpc("bump_ai_usage", {
      p_org_id: orgId,
      p_daily_limit: limit,
    });
    if (!error && allowed === false) {
      console.warn(`AI daily reply quota reached for org ${orgId}`);
      return null;
    }
  } catch (e) {
    console.error("AI quota check failed:", e);
    return null;
  }

  // Try each provider in turn; the first usable answer wins. Only when every
  // provider fails do we return null and let the caller send the static reply.
  let raw: string | null = null;
  for (const provider of chain) {
    raw =
      provider === "openrouter"
        ? await completeWithOpenRouter(system, turns)
        : provider === "gemini"
        ? await completeWithGemini(system, turns)
        : await completeWithGLM(system, turns);
    if (raw) {
      if (provider !== PRIMARY_PROVIDER) {
        console.warn(
          `AI primary provider (${PRIMARY_PROVIDER}) failed; answered with fallback ${provider}.`
        );
      }
      break;
    }
  }
  if (!raw) {
    console.error(`All AI providers failed (${chain.join(", ")}); using static reply.`);
    return null;
  }

  const handoff = raw.includes("[HANDOFF]");
  return { text: raw.replace(/\[HANDOFF\]/g, "").trim(), handoff };
}
