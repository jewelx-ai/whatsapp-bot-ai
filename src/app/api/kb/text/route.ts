import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrgForCurrentUser } from "@/lib/org";
import { ingestDocument } from "@/lib/kb";
import { checkKbIngestion } from "@/lib/limits";

export const maxDuration = 120;

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  text: z.string().min(20).max(500_000),
});

// Ingest pasted text (FAQs, policies) into the knowledge base.
export async function POST(req: NextRequest) {
  const org = await getOrgForCurrentUser();
  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const limit = await checkKbIngestion(org, parsed.data.text.length);
  if (!limit.ok) {
    return NextResponse.json(limit, { status: 403 });
  }

  try {
    const result = await ingestDocument({
      orgId: org.id,
      title: parsed.data.title,
      sourceType: "text",
      text: parsed.data.text,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Text ingestion failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingestion failed" },
      { status: 422 }
    );
  }
}
