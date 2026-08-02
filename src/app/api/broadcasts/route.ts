import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOrgForCurrentUser } from "@/lib/org";
import { checkBroadcastAudience, getPlanLimits, requireActivePlan } from "@/lib/limits";
import {
  findBroadcastByIdempotencyKey,
  processBroadcastBatch,
  type BroadcastProcessResult,
} from "@/lib/broadcasts";

const createSchema = z.object({
  templateName: z.string().trim().min(1),
  languageCode: z.string().trim().min(2).default("en_US"),
  audienceTag: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

const processSchema = z.object({
  broadcastId: z.string().uuid(),
});

// Create an idempotent campaign, enqueue recipients, and process one bounded
// batch. The client can call PATCH with the returned broadcastId to continue.
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

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const activePlan = requireActivePlan(org);
  if (!activePlan.ok) {
    return NextResponse.json(activePlan, { status: 403 });
  }

  const db = supabaseAdmin();
  const { templateName, languageCode, audienceTag } = parsed.data;
  const idempotencyKey = parsed.data.idempotencyKey ?? crypto.randomUUID();

  const existing = await findBroadcastByIdempotencyKey(org.id, idempotencyKey);
  if (existing) {
    const processed = await processBroadcastBatch(org, existing.id);
    if (!processed.ok) return broadcastError(processed);
    return NextResponse.json({ ...processed, idempotencyKey, reused: true });
  }

  let countQuery = db
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("opted_in", true);
  if (audienceTag) countQuery = countQuery.contains("tags", [audienceTag]);
  const { count: audienceCount, error: countErr } = await countQuery;
  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  const audienceSize = audienceCount ?? 0;
  const audienceCheck = checkBroadcastAudience(org, audienceSize);
  if (!audienceCheck.ok) {
    return NextResponse.json(audienceCheck, { status: 403 });
  }

  let query = db
    .from("contacts")
    .select("id, wa_phone")
    .eq("org_id", org.id)
    .eq("opted_in", true);
  if (audienceTag) query = query.contains("tags", [audienceTag]);
  const { data: contacts, error: contactsErr } = await query
    .order("created_at", { ascending: true })
    .limit(getPlanLimits(org.plan).broadcastRecipientsPerCampaign);

  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  if (!contacts || contacts.length === 0) {
    const { count: optedIn } = await db
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("opted_in", true);

    const error = audienceTag
      ? `No opted-in contacts are tagged "${audienceTag}". ` +
        `This workspace has ${optedIn ?? 0} opted-in contact(s) - add the tag in ` +
        `Contacts, or clear the tag field to send to everyone.`
      : "This workspace has no opted-in contacts to send to yet.";

    return NextResponse.json({ error, audienceSize: 0 }, { status: 400 });
  }

  const { data: broadcast, error: broadcastErr } = await db
    .from("broadcasts")
    .insert({
      org_id: org.id,
      template_name: templateName,
      language_code: languageCode,
      audience_tag: audienceTag ?? null,
      idempotency_key: idempotencyKey,
      audience_size: audienceSize,
      status: "queued",
    })
    .select()
    .single();

  if (broadcastErr) {
    if (broadcastErr.code === "23505") {
      const duplicate = await findBroadcastByIdempotencyKey(org.id, idempotencyKey);
      if (duplicate) {
        const processed = await processBroadcastBatch(org, duplicate.id);
        if (!processed.ok) return broadcastError(processed);
        return NextResponse.json({ ...processed, idempotencyKey, reused: true });
      }
    }
    return NextResponse.json({ error: broadcastErr.message }, { status: 500 });
  }

  const recipients = contacts.map((contact) => ({
    org_id: org.id,
    broadcast_id: broadcast.id,
    contact_id: contact.id,
    wa_phone: contact.wa_phone,
  }));
  const { error: recipientErr } = await db.from("broadcast_recipients").insert(recipients);
  if (recipientErr) {
    return NextResponse.json({ error: recipientErr.message }, { status: 500 });
  }

  const processed = await processBroadcastBatch(org, broadcast.id);
  if (!processed.ok) return broadcastError(processed);
  return NextResponse.json({ ...processed, idempotencyKey, reused: false });
}

// Process the next bounded batch for an existing campaign.
export async function PATCH(req: NextRequest) {
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

  const parsed = processSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const activePlan = requireActivePlan(org);
  if (!activePlan.ok) {
    return NextResponse.json(activePlan, { status: 403 });
  }

  const processed = await processBroadcastBatch(org, parsed.data.broadcastId);
  if (!processed.ok) return broadcastError(processed);
  return NextResponse.json(processed);
}

function broadcastError(result: BroadcastProcessResult) {
  if (result.ok) {
    return NextResponse.json(result);
  }
  const status = result.status === "not_found" ? 404 : 500;
  return NextResponse.json(
    { error: result.error ?? "Broadcast could not be processed" },
    { status }
  );
}
