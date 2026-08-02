import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireActivePlan } from "@/lib/limits";
import { orgWaCredentials } from "@/lib/org";
import { sendTemplate } from "@/lib/whatsapp";
import type { Organization } from "@/lib/types";

export const BROADCAST_BATCH_SIZE = 50;
const STALE_PROCESSING_MINUTES = 15;
const MAX_RECIPIENT_ATTEMPTS = 3;

export type BroadcastRow = {
  id: string;
  org_id: string;
  template_name: string;
  language_code: string;
  audience_tag: string | null;
  status: "queued" | "processing" | "completed" | "partial_failed" | "failed";
  audience_size: number;
  processed_count: number;
  sent_count: number;
  failed_count: number;
};

type RecipientRow = {
  id: string;
  wa_phone: string;
  attempts: number;
};

export type BroadcastProcessResult =
  | {
      ok: true;
      broadcast: BroadcastRow;
      done: boolean;
      processedThisBatch: number;
      recoveredStale?: number;
    }
  | {
      ok: false;
      error: string;
      status:
        | "not_found"
        | "plan_inactive"
        | "credential_error"
        | "broadcast_error"
        | "recipient_error";
    };

export async function findBroadcastByIdempotencyKey(
  orgId: string,
  idempotencyKey: string
) {
  const { data } = await supabaseAdmin()
    .from("broadcasts")
    .select("*")
    .eq("org_id", orgId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  return (data as BroadcastRow | null) ?? null;
}

export async function processBroadcastBatch(
  org: Organization,
  broadcastId: string,
  options: { recoverStale?: boolean } = {}
): Promise<BroadcastProcessResult> {
  const activePlan = requireActivePlan(org);
  if (!activePlan.ok) {
    return {
      ok: false,
      error: activePlan.error,
      status: "plan_inactive",
    };
  }

  if (org.suspended) {
    return {
      ok: false,
      error: "Organization is suspended.",
      status: "plan_inactive",
    };
  }

  const db = supabaseAdmin();
  const { data: broadcast, error: broadcastErr } = await db
    .from("broadcasts")
    .select("*")
    .eq("org_id", org.id)
    .eq("id", broadcastId)
    .single();

  if (broadcastErr || !broadcast) {
    return {
      ok: false,
      error: broadcastErr?.message ?? "Broadcast not found",
      status: "not_found",
    };
  }

  const row = broadcast as BroadcastRow;
  if (["completed", "partial_failed", "failed"].includes(row.status)) {
    return { ok: true, broadcast: row, done: true, processedThisBatch: 0 };
  }

  let recoveredStale = 0;
  if (options.recoverStale) {
    recoveredStale = await recoverStaleRecipients(org.id, row.id);
  }

  let creds;
  try {
    creds = orgWaCredentials(org);
  } catch (err) {
    console.error("Could not decrypt WhatsApp credentials for broadcast", err);
    return {
      ok: false,
      error: "Stored WhatsApp credentials cannot be decrypted.",
      status: "credential_error",
    };
  }

  const { error: statusErr } = await db
    .from("broadcasts")
    .update({ status: "processing" })
    .eq("id", row.id)
    .eq("org_id", org.id);
  if (statusErr) {
    return { ok: false, error: statusErr.message, status: "broadcast_error" };
  }

  const { data: recipients, error: recipientErr } = await db
    .from("broadcast_recipients")
    .select("id, wa_phone, attempts")
    .eq("org_id", org.id)
    .eq("broadcast_id", row.id)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(BROADCAST_BATCH_SIZE);

  if (recipientErr) {
    return { ok: false, error: recipientErr.message, status: "recipient_error" };
  }

  let processedThisBatch = 0;
  for (const recipient of (recipients as RecipientRow[] | null) ?? []) {
    const { data: claimed, error: claimErr } = await db
      .from("broadcast_recipients")
      .update({
        status: "processing",
        attempts: recipient.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipient.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();

    if (claimErr) {
      return { ok: false, error: claimErr.message, status: "recipient_error" };
    }
    if (!claimed) continue;

    const result = await sendTemplate(
      creds,
      recipient.wa_phone,
      row.template_name,
      row.language_code
    );
    processedThisBatch++;

    const { error: updateErr } = await db
      .from("broadcast_recipients")
      .update({
        status: result.ok ? "sent" : "failed",
        wa_message_id: result.waMessageId,
        error_kind: result.ok ? null : result.kind ?? "unknown",
        error_reason: result.ok ? null : result.reason ?? "WhatsApp send failed",
        sent_at: result.ok ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipient.id);
    if (updateErr) {
      return { ok: false, error: updateErr.message, status: "recipient_error" };
    }
  }

  const refreshed = await refreshBroadcastCounts(row.id, org.id);
  return {
    ok: true,
    broadcast: refreshed,
    done: ["completed", "partial_failed", "failed"].includes(refreshed.status),
    processedThisBatch,
    recoveredStale,
  };
}

export async function processQueuedBroadcasts(options: { limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 25);
  const db = supabaseAdmin();
  const { data: broadcasts, error } = await db
    .from("broadcasts")
    .select("*")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load queued broadcasts: ${error.message}`);
  }

  const results = [];
  for (const broadcast of (broadcasts as BroadcastRow[] | null) ?? []) {
    const { data: org, error: orgErr } = await db
      .from("organizations")
      .select("*")
      .eq("id", broadcast.org_id)
      .single();

    if (orgErr || !org) {
      results.push({
        broadcastId: broadcast.id,
        ok: false,
        error: orgErr?.message ?? "Organization not found",
      });
      continue;
    }

    const result = await processBroadcastBatch(org as Organization, broadcast.id, {
      recoverStale: true,
    });
    results.push({ broadcastId: broadcast.id, ...result });
  }

  return {
    ok: true,
    checked: broadcasts?.length ?? 0,
    results,
  };
}

async function recoverStaleRecipients(orgId: string, broadcastId: string) {
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000).toISOString();

  const { data: failedRows, error: failErr } = await db
    .from("broadcast_recipients")
    .update({
      status: "failed",
      error_kind: "worker_timeout",
      error_reason: "Recipient stayed processing after maximum retry attempts.",
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("broadcast_id", broadcastId)
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .gte("attempts", MAX_RECIPIENT_ATTEMPTS)
    .select("id");
  if (failErr) throw new Error(`Failed to fail stale recipients: ${failErr.message}`);

  const { data: queuedRows, error: queueErr } = await db
    .from("broadcast_recipients")
    .update({
      status: "queued",
      error_kind: null,
      error_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("broadcast_id", broadcastId)
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .lt("attempts", MAX_RECIPIENT_ATTEMPTS)
    .select("id");
  if (queueErr) throw new Error(`Failed to requeue stale recipients: ${queueErr.message}`);

  return (failedRows?.length ?? 0) + (queuedRows?.length ?? 0);
}

async function refreshBroadcastCounts(
  broadcastId: string,
  orgId: string
): Promise<BroadcastRow> {
  const db = supabaseAdmin();
  const [sent, failed, queued, processing] = await Promise.all([
    db
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .eq("status", "sent"),
    db
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .eq("status", "failed"),
    db
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .eq("status", "queued"),
    db
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .eq("status", "processing"),
  ]);

  const sentCount = sent.count ?? 0;
  const failedCount = failed.count ?? 0;
  const remaining = (queued.count ?? 0) + (processing.count ?? 0);
  const processedCount = sentCount + failedCount;
  const done = remaining === 0;
  const status = done
    ? failedCount === 0
      ? "completed"
      : sentCount === 0
        ? "failed"
        : "partial_failed"
    : "queued";

  const { data, error } = await db
    .from("broadcasts")
    .update({
      status,
      sent_count: sentCount,
      failed_count: failedCount,
      processed_count: processedCount,
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", broadcastId)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update broadcast counts: ${error.message}`);
  return data as BroadcastRow;
}
