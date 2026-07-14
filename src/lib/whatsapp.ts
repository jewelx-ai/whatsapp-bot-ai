// Helpers for sending messages via the Meta WhatsApp Cloud API.

const GRAPH_URL = "https://graph.facebook.com/v21.0";

type SendResult = { waMessageId: string | null; ok: boolean; error?: unknown };

async function callGraph(payload: Record<string, unknown>): Promise<SendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN not configured");
  }

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("WhatsApp send failed:", res.status, JSON.stringify(data));
    return { waMessageId: null, ok: false, error: data };
  }
  return { waMessageId: data?.messages?.[0]?.id ?? null, ok: true };
}

/** Send a plain text message (only valid within the 24h customer service window). */
export function sendText(to: string, body: string) {
  return callGraph({
    to,
    type: "text",
    text: { body, preview_url: false },
  });
}

/** Send a pre-approved template message (required outside the 24h window). */
export function sendTemplate(
  to: string,
  templateName: string,
  languageCode = "en_US",
  components?: unknown[]
) {
  return callGraph({
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  });
}

/** Mark an incoming message as read (shows blue ticks to the user). */
export async function markAsRead(waMessageId: string) {
  return callGraph({ status: "read", message_id: waMessageId });
}
