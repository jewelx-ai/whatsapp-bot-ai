# 12 — Knowledge Base and RAG

> **Readiness update:** URL ingestion has SSRF protection, and plan limits now
> cap KB document count and document size. PDF/text/vector/provider behavior
> still requires representative live testing. See
> [13-feature-readiness-audit.md](13-feature-readiness-audit.md).

## Flow

```text
PDF / URL / pasted text
  → extract/normalize
  → chunks (~1,500 characters, 200 overlap, maximum 500)
  → optional Voyage voyage-3.5-lite embeddings
  → tenant kb_documents + kb_chunks

unmatched incoming question with AI enabled
  → retrieve up to five tenant passages
     ├─ pgvector cosine search when embeddings exist
     └─ PostgreSQL FTS fallback
  → append context to GLM system prompt
  → answer or [HANDOFF]
```

## Retrieval modes

| Mode | Requirement | Notes |
|---|---|---|
| PostgreSQL FTS | None | Default and vector-empty fallback; best for lexical/FAQ matches |
| Voyage + pgvector | `VOYAGE_API_KEY` | Better semantic matching; existing FTS-only documents are not backfilled automatically |

There is no similarity threshold in the current vector RPC, so irrelevant top results and answer quality need evaluation.

## Database

- `kb_documents`: tenant, title, source type/source, processing status, chunk count, timestamp.
- `kb_chunks`: tenant/document, content, nullable 1024-dimensional embedding, generated English FTS, timestamp.
- GIN FTS and HNSW cosine indexes.
- RLS on both tables; deleting a document cascades to chunks.
- `match_kb_chunks` returns nearest embedded passages for an org.

Fresh installs use the tracked `supabase/migrations/` chain. `schema.sql` is a
historical reference only.

## APIs

### `POST /api/kb/upload`

Authenticated multipart PDF/Word upload, filename extension check, 20 MB cap,
text extraction, plan-limit check, then ingestion. MIME/magic validation, malware
policy, scanned-PDF OCR, and production resource testing are not implemented.

### `POST /api/kb/text`

Authenticated title and 20–500,000 character text ingestion, capped further by
the workspace plan.

### `POST /api/kb/url`

Authenticated page fetch, SSRF-safe redirect handling, 5 MB response cap, Cheerio
extraction, plan-limit check, and ingestion.

## Dashboard

`/knowledge` provides PDF/Word, website, and text forms, success/error messages,
document status/list, and RLS-scoped deletion.

## AI integration

`generateAIReply()` retrieves context for the latest user turn and places it inside a `<knowledge_base>` system-prompt section. The prompt asks GLM not to invent facts and to emit `[HANDOFF]` when information is unavailable.

Prompt instructions alone are not a security boundary. Test prompt injection, malicious tenant documents, unsupported claims, source irrelevance, and handoff consistency.

## Operational limitations

- Per-plan document count and document-size quotas are enforced.
- No request rate limits or platform spend alerts.
- Provider retries/timeouts and partial batch recovery need hardening.
- Adding Voyage later does not embed old chunks automatically.
- Failed ingestion can leave an error document row and any chunks inserted before a later batch failure.
- Retrieval quality and model grounding were not live-tested in this audit.
