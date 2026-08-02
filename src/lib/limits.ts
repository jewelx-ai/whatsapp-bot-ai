import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Organization } from "@/lib/types";

export type PlanLimits = {
  aiDailyReplies: number;
  broadcastRecipientsPerCampaign: number;
  kbDocuments: number;
  kbDocumentChars: number;
};

export const PLAN_LIMITS: Record<Organization["plan"], PlanLimits> = {
  free: {
    aiDailyReplies: 25,
    broadcastRecipientsPerCampaign: 25,
    kbDocuments: 3,
    kbDocumentChars: 50_000,
  },
  starter: {
    aiDailyReplies: 500,
    broadcastRecipientsPerCampaign: 500,
    kbDocuments: 25,
    kbDocumentChars: 250_000,
  },
  pro: {
    aiDailyReplies: 2_000,
    broadcastRecipientsPerCampaign: 1_000,
    kbDocuments: 100,
    kbDocumentChars: 500_000,
  },
};

export type LimitCheck =
  | { ok: true }
  | {
      ok: false;
      code: "plan_inactive" | "plan_limit";
      error: string;
      plan: Organization["plan"];
      limit?: number;
      current?: number;
    };

export function getPlanLimits(plan: Organization["plan"]): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function requireActivePlan(org: Pick<Organization, "plan" | "plan_status">): LimitCheck {
  if (org.plan_status === "active") return { ok: true };
  return {
    ok: false,
    code: "plan_inactive",
    plan: org.plan,
    error:
      `This workspace plan is ${org.plan_status}. Ask the platform operator ` +
      "to set the workspace plan status to active.",
  };
}

export function checkBroadcastAudience(
  org: Pick<Organization, "plan" | "plan_status">,
  audienceSize: number
): LimitCheck {
  const active = requireActivePlan(org);
  if (!active.ok) return active;

  const limit = getPlanLimits(org.plan).broadcastRecipientsPerCampaign;
  if (audienceSize <= limit) return { ok: true };
  return {
    ok: false,
    code: "plan_limit",
    plan: org.plan,
    limit,
    current: audienceSize,
    error:
      `Your ${org.plan} plan can send a broadcast to ${limit} recipient(s) at a time. ` +
      `This audience has ${audienceSize}. Narrow the audience or ask the platform operator to change the plan.`,
  };
}

export async function checkKbIngestion(
  org: Pick<Organization, "id" | "plan" | "plan_status">,
  textLength: number
): Promise<LimitCheck> {
  const active = requireActivePlan(org);
  if (!active.ok) return active;

  const limits = getPlanLimits(org.plan);
  if (textLength > limits.kbDocumentChars) {
    return {
      ok: false,
      code: "plan_limit",
      plan: org.plan,
      limit: limits.kbDocumentChars,
      current: textLength,
      error:
        `Your ${org.plan} plan allows knowledge documents up to ` +
        `${limits.kbDocumentChars.toLocaleString()} characters. This document has ` +
        `${textLength.toLocaleString()} characters.`,
    };
  }

  const { count, error } = await supabaseAdmin()
    .from("kb_documents")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id);
  if (error) {
    return {
      ok: false,
      code: "plan_limit",
      plan: org.plan,
      error: `Could not check knowledge-base plan usage: ${error.message}`,
    };
  }

  const current = count ?? 0;
  if (current < limits.kbDocuments) return { ok: true };
  return {
    ok: false,
    code: "plan_limit",
    plan: org.plan,
    limit: limits.kbDocuments,
    current,
    error:
      `Your ${org.plan} plan allows ${limits.kbDocuments} knowledge document(s). ` +
      "Delete an old document or ask the platform operator to change the plan.",
  };
}

export async function aiDailyLimitForOrg(orgId: string): Promise<number | null> {
  const { data } = await supabaseAdmin()
    .from("organizations")
    .select("plan, plan_status")
    .eq("id", orgId)
    .single();

  const org = data as Pick<Organization, "plan" | "plan_status"> | null;
  if (!org || org.plan_status !== "active") return null;
  return getPlanLimits(org.plan).aiDailyReplies;
}
