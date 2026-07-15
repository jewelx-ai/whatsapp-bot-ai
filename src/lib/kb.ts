import { supabaseAdmin } from "@/lib/supabase/admin";

// Knowledge Base ingestion + retrieval (RAG).
//
// Retrieval strategy:
//  - If VOYAGE_API_KEY is set, chunks are embedded (Voyage voyage-3.5-lite,
//    1024 dims) and retrieval uses pgvector cosine similarity.
//  - Otherwise retrieval falls back to Postgres full-text search — zero extra
//    services, good enough for FAQ-style content.

const CHUNK_SIZE = 1500; // characters
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS_PER_DOC = 500;
const VOYAGE_MODEL = "voyage-3.5-lite";

// ---------- chunking ----------

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length && chunks.length < MAX_CHUNKS_PER_DOC) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    // Prefer to break at a paragraph or sentence boundary
    if (end < clean.length) {
      const para = clean.lastIndexOf("\n\n", end);
      const sentence = clean.lastIndexOf(". ", end);
      const breakAt = Math.max(para, sentence);
      if (breakAt > start + CHUNK_SIZE / 2) end = breakAt + 1;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk.length > 20) chunks.push(chunk);
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

// ---------- embeddings (optional) ----------

function embeddingsEnabled(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64);
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: batch, input_type: inputType }),
    });
    if (!res.ok) {
      throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    for (const item of data.data) out.push(item.embedding);
  }
  return out;
}

// ---------- ingestion ----------

export async function ingestDocument(opts: {
  orgId: string;
  title: string;
  sourceType: "pdf" | "url" | "text";
  source?: string;
  text: string;
}): Promise<{ documentId: string; chunkCount: number }> {
  const db = supabaseAdmin();
  const chunks = chunkText(opts.text);
  if (chunks.length === 0) {
    throw new Error("No extractable text found in the document");
  }

  const { data: doc, error: docErr } = await db
    .from("kb_documents")
    .insert({
      org_id: opts.orgId,
      title: opts.title,
      source_type: opts.sourceType,
      source: opts.source ?? null,
      status: "processing",
      chunk_count: chunks.length,
    })
    .select("id")
    .single();
  if (docErr || !doc) throw new Error(docErr?.message ?? "Failed to create document");

  try {
    const embeddings = embeddingsEnabled() ? await embed(chunks, "document") : null;

    const rows = chunks.map((content, i) => ({
      org_id: opts.orgId,
      document_id: doc.id,
      content,
      embedding: embeddings ? embeddings[i] : null,
    }));
    // Insert in batches to stay under payload limits
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await db.from("kb_chunks").insert(rows.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }

    await db.from("kb_documents").update({ status: "ready" }).eq("id", doc.id);
    return { documentId: doc.id, chunkCount: chunks.length };
  } catch (err) {
    await db.from("kb_documents").update({ status: "error" }).eq("id", doc.id);
    throw err;
  }
}

// ---------- retrieval ----------

/**
 * Return the most relevant KB passages for a query, formatted for inclusion
 * in the AI system prompt. Empty string when the org has no KB / no matches.
 */
export async function retrieveContext(orgId: string, query: string): Promise<string> {
  const db = supabaseAdmin();
  let results: { content: string; title: string }[] = [];

  try {
    if (embeddingsEnabled()) {
      const [queryEmbedding] = await embed([query], "query");
      const { data } = await db.rpc("match_kb_chunks", {
        p_org_id: orgId,
        p_query_embedding: queryEmbedding,
        p_match_count: 5,
      });
      results = data ?? [];
    }

    // FTS path — also the fallback when vector search finds nothing
    if (results.length === 0) {
      const { data } = await db
        .from("kb_chunks")
        .select("content, kb_documents(title)")
        .eq("org_id", orgId)
        .textSearch("fts", query, { type: "websearch" })
        .limit(5);
      results = (data ?? []).map((r) => ({
        content: r.content,
        title:
          (r.kb_documents as unknown as { title: string } | null)?.title ?? "Document",
      }));
    }
  } catch (err) {
    console.error("KB retrieval failed:", err);
    return "";
  }

  if (results.length === 0) return "";

  return results
    .map((r, i) => `[Source ${i + 1}: ${r.title}]\n${r.content}`)
    .join("\n\n");
}
