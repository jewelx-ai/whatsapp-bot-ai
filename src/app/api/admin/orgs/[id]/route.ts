import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformAdmin } from "@/lib/platform";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Platform-admin only: update a tenant's plan, billing status, or suspension.
const schema = z.object({
  plan: z.enum(["free", "starter", "pro"]).optional(),
  planStatus: z.enum(["active", "past_due", "canceled"]).optional(),
  suspended: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getPlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { plan, planStatus, suspended } = parsed.data;

  const update: Record<string, unknown> = {};
  if (plan !== undefined) update.plan = plan;
  if (planStatus !== undefined) update.plan_status = planStatus;
  if (suspended !== undefined) update.suspended = suspended;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db.from("organizations").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// Permanently delete a workspace. Tenant data (contacts, conversations,
// messages, auto-replies, broadcasts, knowledge base, usage) is removed by
// ON DELETE CASCADE; member profiles are detached (org_id set to null) rather
// than deleted, so the people keep their accounts.
//
// The caller must pass the exact workspace name as a confirmation guard.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getPlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = z
    .object({ confirmName: z.string() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "confirmName is required" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: org } = await db
    .from("organizations")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  if (parsed.data.confirmName.trim() !== org.name) {
    return NextResponse.json(
      { error: "The name you typed does not match this workspace" },
      { status: 400 }
    );
  }

  const { error } = await db.from("organizations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.warn(`Platform admin ${admin.email} deleted workspace ${org.name} (${id})`);
  return NextResponse.json({ ok: true });
}
