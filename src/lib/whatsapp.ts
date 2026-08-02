// Helpers for sending messages via the Meta WhatsApp Cloud API.
// Multi-tenant: every call takes the organization's own credentials.

const GRAPH_URL = "https://graph.facebook.com/v21.0";

export type WaCredentials = {
  phoneNumberId: string;
  token: string;
};

/**
 * Why a send failed. Classified by Graph error **code**, not `type`: the
 * WhatsApp Cloud API reports `type: "OAuthException"` for many failures that
 * have nothing to do with credentials, so trusting `type` would wrongly tell
 * operators their token is broken.
 */
export type SendFailureKind =
  | "auth" // 190 — token expired/invalid/revoked
  | "permission" // 10 / 131005 — token/app lacks permission for this phone number
  | "recipient_not_allowed" // 131030 — not in a test number's allow list
  | "outside_window" // 131047 — 24h service window closed, template required
  | "undeliverable" // 131026 — number cannot receive this message
  | "invalid_request" // 131009 and friends — bad parameter
  | "rate_limited" // 130429 / 131048
  | "unknown";

type SendResult = {
  waMessageId: string | null;
  ok: boolean;
  error?: unknown;
  /** Graph rejected the credentials (expired/invalid/revoked token). */
  authFailed?: boolean;
  /** Classified failure cause. */
  kind?: SendFailureKind;
  /** Human-readable reason from Graph, safe to log. */
  reason?: string;
};

function classify(status: number, code?: number): SendFailureKind {
  switch (code) {
    case 190:
      return "auth";
    case 10:
    case 131005:
      return "permission";
    case 131030:
      return "recipient_not_allowed";
    case 131047:
      return "outside_window";
    case 131026:
      return "undeliverable";
    case 131009:
    case 100:
      return "invalid_request";
    case 130429:
    case 131048:
      return "rate_limited";
    default:
      // Only a bare 401 without a recognised code is treated as an auth problem.
      return status === 401 ? "auth" : "unknown";
  }
}

type GraphError = {
  message?: string;
  code?: number;
  type?: string;
  error_subcode?: number;
};

async function callGraph(
  creds: WaCredentials,
  payload: Record<string, unknown>,
  operation: "sendText" | "sendTemplate" | "markAsRead" = "sendText"
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
    const graphError: GraphError = (data as { error?: GraphError } | null)?.error ?? {};
    const kind = classify(res.status, graphError.code);
    const detail = `${graphError.message ?? "unknown error"} (code ${
      graphError.code ?? res.status
    })`;

    if (kind === "auth" || kind === "permission") {
      console.error(
        `WhatsApp credentials failed for phone_number_id ${creds.phoneNumberId}: ${detail} — ` +
          `update the access token in Settings and confirm it has WhatsApp permissions.`
      );
    } else if (operation === "markAsRead") {
      // A missing read receipt is cosmetic; never surface it as a send failure.
      console.warn(`WhatsApp read receipt skipped: ${detail}`);
    } else {
      console.error(`WhatsApp ${operation} failed [${kind}]: ${detail}`);
    }

    return {
      waMessageId: null,
      ok: false,
      error: data,
      authFailed: kind === "auth",
      kind,
      reason: graphError.message,
    };
  }
  return { waMessageId: data?.messages?.[0]?.id ?? null, ok: true };
}

/** Send a plain text message (only valid within the 24h customer service window). */
export function sendText(creds: WaCredentials, to: string, body: string) {
  return callGraph(
    creds,
    {
      to,
      type: "text",
      text: { body, preview_url: false },
    },
    "sendText"
  );
}

/** Send a pre-approved template message (required outside the 24h window). */
export function sendTemplate(
  creds: WaCredentials,
  to: string,
  templateName: string,
  languageCode = "en_US",
  components?: unknown[]
) {
  return callGraph(
    creds,
    {
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    },
    "sendTemplate"
  );
}

export type WaVerifyResult =
  | {
      status: "ok";
      displayPhoneNumber?: string;
      verifiedName?: string;
      qualityRating?: string;
    }
  | { status: "invalid"; reason: string }
  | { status: "error"; reason: string };

/**
 * Ask Graph whether these credentials actually work, so the UI can distinguish
 * "a token is stored" from "the token is valid". Read-only: sends nothing.
 */
export async function verifyCredentials(
  creds: WaCredentials
): Promise<WaVerifyResult> {
  if (!creds.phoneNumberId || !creds.token) {
    return { status: "invalid", reason: "Missing WhatsApp credentials" };
  }

  try {
    const res = await fetch(
      `${GRAPH_URL}/${creds.phoneNumberId}` +
        `?fields=display_phone_number,verified_name,quality_rating`,
      {
        headers: { Authorization: `Bearer ${creds.token}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    const data = await res.json().catch(() => null);

    if (res.ok) {
      return {
        status: "ok",
        displayPhoneNumber: data?.display_phone_number,
        verifiedName: data?.verified_name,
        qualityRating: data?.quality_rating,
      };
    }

    const graphError: GraphError = (data as { error?: GraphError } | null)?.error ?? {};
    const authFailed =
      res.status === 401 ||
      graphError.code === 190 ||
      graphError.type === "OAuthException";

    return authFailed
      ? {
          status: "invalid",
          reason: graphError.message ?? "The access token is expired or invalid.",
        }
      : {
          status: "error",
          reason: graphError.message ?? `Graph returned HTTP ${res.status}.`,
        };
  } catch (err) {
    return {
      status: "error",
      reason: err instanceof Error ? err.message : "Could not reach Meta.",
    };
  }
}

/** Mark an incoming message as read (shows blue ticks to the user). */
export function markAsRead(creds: WaCredentials, waMessageId: string) {
  return callGraph(
    creds,
    { status: "read", message_id: waMessageId },
    "markAsRead"
  );
}
