import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformAdmin } from "@/lib/platform";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Platform-admin only: provision a new workspace (tenant).
const schema = z.object({
  name: z.string().trim().min(2).max(200),
  plan: z.enum(["free", "starter", "pro"]).default("free"),
});

export async function POST(req: NextRequest) {
  const admin = await getPlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A workspace name of at least 2 characters is required" },
      { status: 400 }
    );
  }
  const { name, plan } = parsed.data;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("organizations")
    .insert({ name, plan })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
