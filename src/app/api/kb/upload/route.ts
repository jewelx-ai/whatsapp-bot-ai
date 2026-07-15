import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { getOrgForCurrentUser } from "@/lib/org";
import { ingestDocument } from "@/lib/kb";

export const maxDuration = 120; // large PDFs + embeddings can take a while

// Ingest a PDF into the knowledge base (multipart form, field "file").
export async function POST(req: NextRequest) {
  const org = await getOrgForCurrentUser();
  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "PDF too large (max 20 MB)" }, { status: 413 });
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });

    const result = await ingestDocument({
      orgId: org.id,
      title: file.name.replace(/\.pdf$/i, ""),
      sourceType: "pdf",
      source: file.name,
      text,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("PDF ingestion failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF ingestion failed" },
      { status: 422 }
    );
  }
}
