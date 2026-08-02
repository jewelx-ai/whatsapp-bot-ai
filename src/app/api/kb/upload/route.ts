import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { getOrgForCurrentUser } from "@/lib/org";
import { ingestDocument } from "@/lib/kb";
import { checkKbIngestion } from "@/lib/limits";

export const maxDuration = 120; // large files + embeddings can take a while

const MAX_BYTES = 20 * 1024 * 1024;

type Kind = { ext: string; sourceType: "pdf" | "docx"; label: string };

const SUPPORTED: Kind[] = [
  { ext: ".pdf", sourceType: "pdf", label: "PDF" },
  { ext: ".docx", sourceType: "docx", label: "Word" },
];

async function extractPdf(buffer: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function extractDocx(buffer: Uint8Array): Promise<string> {
  // Word stores text in XML, so extraction is exact rather than heuristic.
  // Buffer input is required by mammoth's Node API.
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return value;
}

// Ingest a PDF or Word document into the knowledge base
// (multipart form, field "file").
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

  const name = file.name.toLowerCase();
  const kind = SUPPORTED.find((k) => name.endsWith(k.ext));
  if (!kind) {
    // .doc is the old binary format and is not readable by mammoth.
    const hint = name.endsWith(".doc")
      ? " Legacy .doc files are not supported — save as .docx first."
      : "";
    return NextResponse.json(
      { error: `Only PDF and Word (.docx) files are supported.${hint}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `${kind.label} too large (max 20 MB)` },
      { status: 413 }
    );
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const text =
      kind.sourceType === "pdf"
        ? await extractPdf(buffer)
        : await extractDocx(buffer);

    // Image-only PDFs and empty Word files yield nothing useful; say so instead
    // of storing an empty document.
    if (text.trim().length < 20) {
      return NextResponse.json(
        {
          error:
            `No readable text found in this ${kind.label} file. ` +
            `Scanned or image-only documents need OCR first.`,
        },
        { status: 422 }
      );
    }

    const limit = await checkKbIngestion(org, text.length);
    if (!limit.ok) {
      return NextResponse.json(limit, { status: 403 });
    }

    const result = await ingestDocument({
      orgId: org.id,
      title: file.name.replace(new RegExp(`\\${kind.ext}$`, "i"), ""),
      sourceType: kind.sourceType,
      source: file.name,
      text,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`${kind.label} ingestion failed:`, err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : `${kind.label} ingestion failed`,
      },
      { status: 422 }
    );
  }
}
