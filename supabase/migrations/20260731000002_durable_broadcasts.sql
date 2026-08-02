-- Durable/idempotent broadcasts (2026-07-31)

alter table public.broadcasts
  add column if not exists language_code text not null default 'en_US',
  add column if not exists status text not null default 'completed',
  add column if not exists idempotency_key text,
  add column if not exists audience_size int not null default 0,
  add column if not exists processed_count int not null default 0,
  add column if not exists completed_at timestamptz,
  add constraint broadcasts_status_check
    check (status in ('queued', 'processing', 'completed', 'partial_failed', 'failed'));

create unique index if not exists broadcasts_org_idempotency_key
  on public.broadcasts(org_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  wa_phone text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'failed')),
  attempts int not null default 0,
  wa_message_id text,
  error_kind text,
  error_reason text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (broadcast_id, contact_id)
);

create index if not exists idx_broadcast_recipients_broadcast_status
  on public.broadcast_recipients(broadcast_id, status, created_at);
create index if not exists idx_broadcast_recipients_org
  on public.broadcast_recipients(org_id, created_at desc);

alter table public.broadcast_recipients enable row level security;

drop policy if exists "org broadcast recipients" on public.broadcast_recipients;
create policy "org broadcast recipients" on public.broadcast_recipients
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
