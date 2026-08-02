import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformAdmin, isSuperAdminEmail } from "@/lib/platform";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { withAuthRetry, isTransientAuthError } from "@/lib/supabase/retry";

// Platform-admin only: create and remove user accounts across all tenants.

const createSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().max(200).optional(),
  orgId: z.string().uuid().optional(),
  role: z.enum(["owner", "admin", "agent"]).default("agent"),
});

export async function POST(req: NextRequest) {
  const admin = await getPlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid email and a password of at least 8 characters are required" },
      { status: 400 }
    );
  }
  const { email, password, fullName, orgId, role } = parsed.data;

  const db = supabaseAdmin();
  const { data: created, error } = await withAuthRetry("createUser", () =>
    db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    })
  );
  if (error) {
    const status = isTransientAuthError(error.message) ? 503 : 400;
    return NextResponse.json(
      {
        error: isTransientAuthError(error.message)
          ? "Supabase auth is temporarily unavailable. Please try again."
          : error.message,
      },
      { status }
    );
  }
  if (!created?.user) {
    return NextResponse.json({ error: "Account was not created" }, { status: 500 });
  }

  // The signup trigger creates the profile row; set its workspace and role.
  const profileUpdate: Record<string, unknown> = { role };
  if (orgId) profileUpdate.org_id = orgId;
  if (fullName) profileUpdate.full_name = fullName;

  const { error: pErr } = await db
    .from("profiles")
    .update(profileUpdate)
    .eq("id", created.user.id);
  if (pErr) {
    return NextResponse.json(
      { error: `Account created, but profile update failed: ${pErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: created.user.id });
}

// Change a member's role and/or workspace. Administration lives with the
// operator, so this is the only path that can move someone between workspaces
// or promote/demote them.
const patchSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "agent"]).optional(),
  orgId: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const admin = await getPlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { userId, role, orgId } = parsed.data;
  if (role === undefined && orgId === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from("profiles")
    .select("id, org_id, role, email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (isSuperAdminEmail(profile.email)) {
    return NextResponse.json(
      { error: "The platform operator is not a workspace member" },
      { status: 400 }
    );
  }

  // A workspace must keep at least one owner. Demoting or moving away the last
  // owner would leave the tenant without anyone able to manage it.
  const losesOwnership =
    profile.role === "owner" &&
    ((role !== undefined && role !== "owner") ||
      (orgId !== undefined && orgId !== profile.org_id));

  if (losesOwnership && profile.org_id) {
    const { count } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", profile.org_id)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "This workspace would be left without an owner" },
        { status: 400 }
      );
    }
  }

  const update: Record<string, unknown> = {};
  if (role !== undefined) update.role = role;
  if (orgId !== undefined) update.org_id = orgId;

  const { error } = await db.from("profiles").update(update).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.warn(
    `Platform admin ${admin.email} updated ${profile.email ?? userId}: ` +
      JSON.stringify(update)
  );
  return NextResponse.json({ ok: true });
}

// Permanently delete a user account. The profile row is removed by
// ON DELETE CASCADE. Requires the exact email as a confirmation guard, and
// refuses to delete the platform operator account.
export async function DELETE(req: NextRequest) {
  const admin = await getPlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = z
    .object({ userId: z.string().uuid(), confirmEmail: z.string() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "userId and confirmEmail are required" },
      { status: 400 }
    );
  }
  const { userId, confirmEmail } = parsed.data;

  const db = supabaseAdmin();
  // Read the email from profiles (synced copy) rather than the GoTrue admin
  // directory, which is unreliable on this project's ES256 keys.
  const { data: profile, error: pLookupErr } = await db
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();
  if (pLookupErr) {
    console.error("delete user lookup failed:", pLookupErr.message);
    return NextResponse.json(
      { error: "Could not verify the account just now. Please try again." },
      { status: 503 }
    );
  }
  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const targetEmail = profile.email ?? "";

  if (confirmEmail.trim().toLowerCase() !== targetEmail.toLowerCase()) {
    return NextResponse.json(
      { error: "The email you typed does not match this user" },
      { status: 400 }
    );
  }
  if (userId === admin.userId || isSuperAdminEmail(targetEmail)) {
    return NextResponse.json(
      { error: "The platform operator account cannot be deleted here" },
      { status: 400 }
    );
  }

  const { error } = await withAuthRetry("deleteUser", () =>
    db.auth.admin.deleteUser(userId)
  );
  if (error) {
    const transient = isTransientAuthError(error.message);
    return NextResponse.json(
      {
        error: transient
          ? "Supabase auth is temporarily unavailable. Please try again."
          : error.message,
      },
      { status: transient ? 503 : 500 }
    );
  }

  console.warn(`Platform admin ${admin.email} deleted user ${targetEmail} (${userId})`);
  return NextResponse.json({ ok: true });
}
