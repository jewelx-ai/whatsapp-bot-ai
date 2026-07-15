# 12 — Knowledge Base & RAG

The AI bot answers customer questions from **the business's own content** — PDFs, website pages, and pasted text — using Retrieval-Augmented Generation (RAG). Per-tenant, like everything else.

## How it works

```
Ingestion:  PDF / URL / text ──► extract text ──► chunk (~1500 chars, 200 overlap)
            ──► [embed via Voyage, if key set] ──► kb_chunks (per org)

Answering:  incoming message (no keyword match, AI on)
            ──► retrieve top-5 relevant chunks for this org
                 • vector search (pgvector cosine) when embeddings exist
                 • Postgres full-text search otherwise / as fallback
            ──► inject into Claude's system prompt as <knowledge_base>
            ──► Claude answers from it; unknown → [HANDOFF] to human
```

## Two retrieval modes (zero-config default)

| Mode | Requires | Quality |
|---|---|---|
| **Full-text search** (default) | Nothing — works out of the box | Good for FAQ/keyword-style questions |
| **Vector search** | `VOYAGE_API_KEY` env (voyage-3.5-lite, 1024-dim) | Better for paraphrased/semantic questions |

The mode is chosen automatically: chunks get embeddings only when the key is present; retrieval tries vectors first and falls back to FTS. You can add the key later — only newly ingested documents get embeddings (re-upload old ones to upgrade them).

## Database (migration 003)

- `kb_documents` — per-org: title, source_type (`pdf`/`url`/`text`), source, status (`processing`/`ready`/`error`), chunk_count
- `kb_chunks` — content, `embedding vector(1024)` (nullable), generated `fts tsvector` column; GIN + HNSW indexes
- `match_kb_chunks(org, embedding, count)` — cosine similarity RPC
- Org-scoped RLS on both tables; deleting a document cascades to its chunks

**Existing databases:** run [`supabase/migration-003-knowledge-base.sql`](../supabase/migration-003-knowledge-base.sql) in the SQL Editor. Fresh installs: `schema.sql` already includes it.

## API endpoints (all auth-required)

| Endpoint | Input | Notes |
|---|---|---|
| `POST /api/kb/upload` | multipart `file` (PDF) | Max 20 MB; text extracted with unpdf |
| `POST /api/kb/url` | `{url}` | Fetches the page, strips nav/scripts (cheerio), indexes main content |
| `POST /api/kb/text` | `{title, text}` | Pasted FAQs/policies, 20–500K chars |

Responses: `200 {ok, documentId, chunkCount}` · `401` · `400` validation · `413` too large · `422` extraction/ingestion failure (document marked `error`).
Deletion happens client-side via Supabase (RLS-protected), cascading to chunks.

## Dashboard: `/knowledge`

Three tabs (PDF upload / website URL / paste text), success shows passages-indexed count, document list with type icon, source, chunk count, status badge, and delete.

## AI prompt integration

`generateAIReply` retrieves context for the user's latest message and appends it to the system prompt inside a `<knowledge_base>` block. The prompt instructs Claude to prefer KB content, never invent facts, never mention "sources", and emit `[HANDOFF]` when the KB doesn't cover the question.
