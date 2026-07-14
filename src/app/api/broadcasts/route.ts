import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplate } from "@/lib/whatsapp";

const bodySchema = z.object({
  templateName: z.string().min(1),
  languageCode: z.string().min(2).default("en_US"),
  audienceTag: z.string().trim().optional(), // omit = all opted-in contacts
});

// Send a pre-approved template message to an audience (all or by tag).
// Templates are required because broadcasts go outside the 24h window.
export async function POST(req: NextRequest) {
  const auth = await supabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { templateName, languageCode, audienceTag } = parsed.data;

  const db = supabaseAdmin();
  let query = db.from("contacts").select("wa_phone").eq("opted_in", true);
  if (audienceTag) query = query.contains("tags", [audienceTag]);
  const { data: contacts } = await query.limit(1000);

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ error: "No matching contacts" }, { status: 404 });
  }

  let sent = 0;
  let failed = 0;
  for (const c of contacts) {
    const result = await sendTemplate(c.wa_phone, templateName, languageCode);
    if (result.ok) sent++;
    else failed++;
  }

  const { data: broadcast } = await db
    .from("broadcasts")
    .insert({
      template_name: templateName,
      audience_tag: audienceTag ?? null,
      sent_count: sent,
      failed_count: failed,
    })
    .select()
    .single();

  return NextResponse.json({ ok: true, sent, failed, broadcast });
}
