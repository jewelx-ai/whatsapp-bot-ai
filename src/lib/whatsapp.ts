// Helpers for sending messages via the Meta WhatsApp Cloud API.
// Multi-tenant: every call takes the organization's own credentials.

const GRAPH_URL = "https://graph.facebook.com/v21.0";

export type WaCredentials = {
  phoneNumberId: string;
  token: string;
};

type SendResult = { waMessageId: string | null; ok: boolean; error?: unknown };

async function callGraph(
  creds: WaCredentials,
  payload: Record<string, unknown>
): Promise<SendResult> {
  if (!creds.phoneNumberId || !creds.token) {
    return { waMessageId: null, ok: false, error: "Missing WhatsApp credentials" };
  }

  const res = await fetch(`${GRAPH_URL}/${creds.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
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
export function sendText(creds: WaCredentials, to: string, body: string) {
  return callGraph(creds, {
    to,
    type: "text",
    text: { body, preview_url: false },
  });
}

/** Send a pre-approved template message (required outside the 24h window). */
export function sendTemplate(
  creds: WaCredentials,
  to: string,
  templateName: string,
  languageCode = "en_US",
  components?: unknown[]
) {
  return callGraph(creds, {
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
export function markAsRead(creds: WaCredentials, waMessageId: string) {
  return callGraph(creds, { status: "read", message_id: waMessageId });
}
