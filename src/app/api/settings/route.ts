import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/org";
import { encryptWaToken, waTokenHint } from "@/lib/secrets";

// Settings are read/written through this server route (service role) so the
// WhatsApp access token is never exposed to the browser, and changes to the
// WhatsApp credentials are restricted to owner/admin.

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json(
      { error: "Please sign in again.", code: "no_session" },
      { status: 401 }
    );
  }
  if (!profile.orgId) {
    return NextResponse.json(
      { error: "This account is not attached to a workspace.", code: "no_workspace" },
      { status: 409 }
    );
  }

  const db = supabaseAdmin();
  const { data: org } = await db
    .from("organizations")
    .select("id, name, wa_phone_number_id, wa_access_token, ai_enabled, plan, plan_status")
    .eq("id", profile.orgId)
    .single();

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Never return the token itself. A masked hint (length + last 4 characters)
  // lets an owner confirm which token is stored without exposing a usable
  // secret to the browser.
  let tokenHint = null;
  try {
    tokenHint = waTokenHint(org.wa_access_token as string | null);
  } catch (err) {
    console.error("Could not decrypt stored WhatsApp token hint", err);
    return NextResponse.json(
      { error: "Stored WhatsApp credentials cannot be decrypted" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: org.id,
    name: org.name,
    phoneNumberId: org.wa_phone_number_id,
    aiEnabled: org.ai_enabled,
    plan: org.plan,
    planStatus: org.plan_status,
    role: profile.role,
    connected: !!(org.wa_phone_number_id && tokenHint),
    tokenHint,
  });
}

// `connected` here only means credentials are stored. Whether they still work is
// answered by GET /api/settings/verify, which asks Meta.
const bodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  aiEnabled: z.boolean().optional(),
  phoneNumberId: z
    .string()
    .trim()
    .max(100)
    .regex(/^\d*$/, "Phone Number ID must contain only digits")
    .optional(),
  accessToken: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json(
      { error: "Please sign in again.", code: "no_session" },
      { status: 401 }
    );
  }
  if (!profile.orgId) {
    return NextResponse.json(
      { error: "This account is not attached to a workspace.", code: "no_workspace" },
      { status: 409 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, aiEnabled, phoneNumberId, accessToken } = parsed.data;

  const changesWhatsApp = phoneNumberId !== undefined || accessToken !== undefined;
  if (changesWhatsApp && !["owner", "admin"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Only an owner or admin can change WhatsApp credentials" },
      { status: 403 }
    );
  }

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (aiEnabled !== undefined) update.ai_enabled = aiEnabled;
  if (phoneNumberId !== undefined) update.wa_phone_number_id = phoneNumberId || null;
  if (accessToken !== undefined) {
    try {
      update.wa_access_token = accessToken ? encryptWaToken(accessToken) : null;
    } catch (err) {
      console.error("Could not encrypt WhatsApp token", err);
      return NextResponse.json(
        { error: "Server is missing valid WhatsApp token encryption config" },
        { status: 500 }
      );
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from("organizations")
    .update(update)
    .eq("id", profile.orgId);

  if (error) {
    if (
      error.code === "23505" &&
      error.message.includes("organizations_wa_phone_number_id_key")
    ) {
      return NextResponse.json(
        {
          error:
            "This WhatsApp Phone Number ID is already connected to another workspace. Remove it from that workspace first, or use a different Phone Number ID.",
          code: "phone_number_id_in_use",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
