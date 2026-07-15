-- Migration 003 — Knowledge Base + RAG
-- Run this on an EXISTING project that already has schema.sql (v2) applied.
-- (Fresh installs: schema.sql now includes this section too.)

create extension if not exists vector;

create table if not exists kb_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  source_type text not null check (source_type in ('pdf', 'url', 'text')),
  source text,                      -- filename or URL
  status text not null default 'ready' check (status in ('processing', 'ready', 'error')),
  chunk_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists kb_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  document_id uuid not null references kb_documents(id) on delete cascade,
  content text not null,
  embedding vector(1024),           -- Voyage voyage-3.5-lite; null when using FTS-only mode
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_kb_documents_org on kb_documents(org_id);
create index if not exists idx_kb_chunks_document on kb_chunks(document_id);
create index if not exists idx_kb_chunks_fts on kb_chunks using gin(fts);
create index if not exists idx_kb_chunks_embedding on kb_chunks
  using hnsw (embedding vector_cosine_ops);

alter table kb_documents enable row level security;
alter table kb_chunks enable row level security;

create policy "org kb_documents" on kb_documents for all to authenticated
  using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org kb_chunks" on kb_chunks for all to authenticated
  using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());

-- Vector similarity search (used when embeddings are available)
create or replace function public.match_kb_chunks(
  p_org_id uuid,
  p_query_embedding vector(1024),
  p_match_count int default 5
)
returns table (content text, title text, similarity float)
language sql stable as $$
  select c.content, d.title,
         1 - (c.embedding <=> p_query_embedding) as similarity
  from kb_chunks c
  join kb_documents d on d.id = c.document_id
  where c.org_id = p_org_id and c.embedding is not null
  order by c.embedding <=> p_query_embedding
  limit p_match_count
$$;
