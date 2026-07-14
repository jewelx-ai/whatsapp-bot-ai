-- WhatsApp Bot SaaS — Supabase schema (v2, MULTI-TENANT)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Every tenant is an "organization"; all data rows carry org_id and RLS
-- restricts each dashboard user to their own organization's rows.

-- ============ TENANTS ============

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Per-tenant WhatsApp Cloud API connection (from the platform's Meta app)
  wa_phone_number_id text unique,       -- routes incoming webhooks to this org
  wa_access_token text,                 -- token used to send messages for this org
  ai_enabled boolean not null default false,
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro')),
  plan_status text not null default 'active' check (plan_status in ('active', 'past_due', 'canceled')),
  created_at timestamptz not null default now()
);

-- Dashboard users (linked to Supabase Auth), each belongs to one org
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete set null,
  full_name text,
  role text not null default 'agent' check (role in ('owner', 'admin', 'agent')),
  created_at timestamptz not null default now()
);

-- ============ TENANT DATA ============

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  wa_phone text not null,               -- e.g. "919876543210" (no +)
  name text,
  tags text[] not null default '{}',
  opted_in boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, wa_phone)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  status text not null default 'bot' check (status in ('bot', 'open', 'closed')),
  assigned_to uuid,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  type text not null default 'text',
  body text,
  media_url text,
  wa_message_id text unique,
  status text not null default 'received',
  created_at timestamptz not null default now()
);

create table if not exists auto_replies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  trigger_keyword text not null,
  match_type text not null default 'contains' check (match_type in ('exact', 'contains', 'starts_with')),
  response_text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  template_name text not null,
  audience_tag text,
  scheduled_at timestamptz,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now()
);

-- ============ INDEXES ============
create index if not exists idx_messages_conversation on messages(conversation_id, created_at desc);
create index if not exists idx_messages_org on messages(org_id, created_at desc);
create index if not exists idx_conversations_contact on conversations(contact_id);
create index if not exists idx_conversations_org_last on conversations(org_id, last_message_at desc);
create index if not exists idx_contacts_org on contacts(org_id);
create index if not exists idx_auto_replies_org on auto_replies(org_id);
create index if not exists idx_broadcasts_org on broadcasts(org_id);
create index if not exists idx_orgs_wa_phone_number on organizations(wa_phone_number_id);

-- ============ TENANT ISOLATION HELPERS ============

-- The caller's org (from their profile). SECURITY DEFINER so RLS on
-- profiles doesn't recurse.
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as
$$ select org_id from profiles where id = auth.uid() $$;

-- Create an organization for the signed-in user (onboarding).
-- Sets them as owner and seeds default auto-replies.
create or replace function public.create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if (select org_id from profiles where id = auth.uid()) is not null then
    raise exception 'user already belongs to an organization';
  end if;

  insert into organizations (name) values (org_name) returning id into new_org_id;

  update profiles set org_id = new_org_id, role = 'owner' where id = auth.uid();

  insert into auto_replies (org_id, trigger_keyword, match_type, response_text) values
    (new_org_id, 'hi', 'exact', 'Hello! 👋 Welcome. Reply with:
1️⃣ *price* — see our pricing
2️⃣ *help* — talk to a human'),
    (new_org_id, 'hello', 'exact', 'Hello! 👋 Welcome. Reply with:
1️⃣ *price* — see our pricing
2️⃣ *help* — talk to a human'),
    (new_org_id, 'price', 'contains', 'Reply *help* and our team will share pricing details with you.'),
    (new_org_id, 'help', 'contains', 'Got it! A team member will reply to you shortly. 🙂');

  return new_org_id;
end $$;

-- Auto-create a profile row when a user signs up (no org yet → onboarding)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ ROW LEVEL SECURITY (tenant isolation) ============
-- Server code (webhook, send APIs) uses the service-role key and bypasses RLS.
-- Dashboard users only ever see rows where org_id = their org.

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table auto_replies enable row level security;
alter table broadcasts enable row level security;

create policy "own org read" on organizations for select to authenticated
  using (id = public.current_org_id());
create policy "own org update" on organizations for update to authenticated
  using (id = public.current_org_id());

create policy "own profile read" on profiles for select to authenticated
  using (auth.uid() = id or org_id = public.current_org_id());
create policy "own profile update" on profiles for update to authenticated
  using (auth.uid() = id);

create policy "org contacts" on contacts for all to authenticated
  using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org conversations" on conversations for all to authenticated
  using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org messages" on messages for all to authenticated
  using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org auto_replies" on auto_replies for all to authenticated
  using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org broadcasts" on broadcasts for all to authenticated
  using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());

-- Realtime for the live inbox
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
