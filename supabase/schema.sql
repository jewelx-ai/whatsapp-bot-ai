-- WhatsApp Bot — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ============ TABLES ============

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  wa_phone text not null unique,          -- e.g. "919876543210" (no +)
  name text,
  tags text[] not null default '{}',
  opted_in boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  status text not null default 'bot' check (status in ('bot', 'open', 'closed')),
  assigned_to uuid,                        -- profiles.id of the agent
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  type text not null default 'text',       -- text | image | audio | document | ...
  body text,
  media_url text,
  wa_message_id text unique,               -- Meta's message id, for dedupe + status updates
  status text not null default 'received', -- received | sent | delivered | read | failed
  created_at timestamptz not null default now()
);

create table if not exists auto_replies (
  id uuid primary key default gen_random_uuid(),
  trigger_keyword text not null,
  match_type text not null default 'contains' check (match_type in ('exact', 'contains', 'starts_with')),
  response_text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  template_name text not null,
  audience_tag text,
  scheduled_at timestamptz,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Dashboard users (linked to Supabase Auth)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  created_at timestamptz not null default now()
);

-- ============ INDEXES ============
create index if not exists idx_messages_conversation on messages(conversation_id, created_at desc);
create index if not exists idx_conversations_contact on conversations(contact_id);
create index if not exists idx_conversations_last_message on conversations(last_message_at desc);

-- ============ ROW LEVEL SECURITY ============
-- Webhook/server code uses the service-role key and bypasses RLS.
-- Dashboard users (authenticated) can read/write everything for now;
-- tighten per-role later.

alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table auto_replies enable row level security;
alter table broadcasts enable row level security;
alter table profiles enable row level security;

create policy "authenticated read contacts" on contacts for select to authenticated using (true);
create policy "authenticated write contacts" on contacts for all to authenticated using (true) with check (true);

create policy "authenticated read conversations" on conversations for select to authenticated using (true);
create policy "authenticated write conversations" on conversations for all to authenticated using (true) with check (true);

create policy "authenticated read messages" on messages for select to authenticated using (true);
create policy "authenticated write messages" on messages for all to authenticated using (true) with check (true);

create policy "authenticated manage auto_replies" on auto_replies for all to authenticated using (true) with check (true);
create policy "authenticated manage broadcasts" on broadcasts for all to authenticated using (true) with check (true);

create policy "own profile read" on profiles for select to authenticated using (auth.uid() = id);
create policy "own profile update" on profiles for update to authenticated using (auth.uid() = id);

-- Auto-create a profile row when a user signs up
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

-- Realtime for the live inbox
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;

-- ============ SEED: default auto-replies ============
insert into auto_replies (trigger_keyword, match_type, response_text) values
  ('hi', 'exact', 'Hello! 👋 Welcome. Reply with:
1️⃣ *price* — see our pricing
2️⃣ *help* — talk to a human'),
  ('hello', 'exact', 'Hello! 👋 Welcome. Reply with:
1️⃣ *price* — see our pricing
2️⃣ *help* — talk to a human'),
  ('price', 'contains', 'Our pricing starts at ₹999/month. Reply *help* to talk to our team about a custom plan.'),
  ('help', 'contains', 'Got it! A team member will reply to you shortly. 🙂')
on conflict do nothing;
