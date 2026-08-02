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
  sourceType: "pdf" | "docx" | "url" | "text";
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
    // Embedding is an enhancement, not a requirement: if Voyage is rate limited
    // or down, store the passages anyway so full-text retrieval still works
    // rather than losing the whole upload.
    let embeddings: number[][] | null = null;
    if (embeddingsEnabled()) {
      try {
        embeddings = await embed(chunks, "document");
      } catch (err) {
        console.warn(
          "Embedding failed, storing passages for full-text search only:",
          err instanceof Error ? err.message : err
        );
      }
    }

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

// Words carrying no retrieval signal. Removing them keeps the OR fallback from
// matching every passage on "do"/"you"/"what".
const STOPWORDS = new Set([
  "the", "and", "for", "are", "you", "your", "yours", "our", "ours", "was",
  "were", "have", "has", "had", "what", "when", "where", "which", "who", "whom",
  "how", "why", "can", "could", "would", "should", "will", "shall", "does",
  "did", "doing", "with", "without", "from", "into", "about", "there", "their",
  "they", "them", "this", "that", "these", "those", "any", "all", "some", "get",
  "got", "give", "tell", "please", "want", "need", "know", "much", "many",
  "hello", "hey", "thanks", "thank", "yes", "not", "but", "its", "just",
]);

/**
 * Build an OR tsquery from a natural-language question. Non-alphanumerics are
 * stripped so the input can never produce invalid tsquery syntax.
 */
function toOrTsQuery(query: string): string | null {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  const unique = [...new Set(terms)].slice(0, 10);
  return unique.length > 0 ? unique.join(" | ") : null;
}

const MAX_CONTEXT_CHARS = 12000;
// A knowledge base this small fits in the prompt whole, which beats returning
// nothing when the customer's wording does not match the document's wording.
const SMALL_KB_CHUNK_LIMIT = 12;

type Passage = { content: string; title: string };

function mapRows(
  rows: { content: string; kb_documents?: unknown }[] | null
): Passage[] {
  return (rows ?? []).map((r) => ({
    content: r.content,
    title:
      (r.kb_documents as unknown as { title: string } | null)?.title ?? "Document",
  }));
}

/**
 * Return the most relevant KB passages for a query, formatted for inclusion in
 * the AI system prompt. Empty string only when the org has no knowledge base.
 *
 * Strategy, in order:
 *  1. pgvector similarity when embeddings are configured (best).
 *  2. Full-text search with AND semantics — precise.
 *  3. Full-text search with OR semantics — catches partial wording matches.
 *  4. For a small knowledge base, return everything. Keyword search cannot
 *     bridge vocabulary gaps ("shop" vs "store"), and answering from the whole
 *     document is far better than letting the model guess.
 */
export async function retrieveContext(orgId: string, query: string): Promise<string> {
  const db = supabaseAdmin();
  let results: Passage[] = [];

  try {
    if (embeddingsEnabled()) {
      // Isolated: a Voyage outage or rate limit (the free tier allows only
      // 3 requests/minute) must not abort retrieval — the keyword stages below
      // are a perfectly usable fallback.
      try {
        const [queryEmbedding] = await embed([query], "query");
        const { data } = await db.rpc("match_kb_chunks", {
          p_org_id: orgId,
          p_query_embedding: queryEmbedding,
          p_match_count: 5,
        });
        results = data ?? [];
      } catch (err) {
        console.warn(
          "Embedding query failed, falling back to full-text search:",
          err instanceof Error ? err.message : err
        );
      }
    }

    // 2 — precise full-text search
    if (results.length === 0) {
      const { data } = await db
        .from("kb_chunks")
        .select("content, kb_documents(title)")
        .eq("org_id", orgId)
        .textSearch("fts", query, { type: "websearch" })
        .limit(5);
      results = mapRows(data);
    }

    // 3 — any-term match
    if (results.length === 0) {
      const orQuery = toOrTsQuery(query);
      if (orQuery) {
        const { data } = await db
          .from("kb_chunks")
          .select("content, kb_documents(title)")
          .eq("org_id", orgId)
          .textSearch("fts", orQuery)
          .limit(5);
        results = mapRows(data);
      }
    }

    // 4 — small knowledge base: send all of it
    if (results.length === 0) {
      const { count } = await db
        .from("kb_chunks")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId);
      if ((count ?? 0) > 0 && (count ?? 0) <= SMALL_KB_CHUNK_LIMIT) {
        const { data } = await db
          .from("kb_chunks")
          .select("content, kb_documents(title)")
          .eq("org_id", orgId)
          .limit(SMALL_KB_CHUNK_LIMIT);
        results = mapRows(data);
      }
    }
  } catch (err) {
    console.error("KB retrieval failed:", err);
    return "";
  }

  if (results.length === 0) return "";

  // Keep the prompt bounded.
  const parts: string[] = [];
  let used = 0;
  for (const [i, r] of results.entries()) {
    const block = `[Source ${i + 1}: ${r.title}]\n${r.content}`;
    if (used + block.length > MAX_CONTEXT_CHARS) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n");
}
