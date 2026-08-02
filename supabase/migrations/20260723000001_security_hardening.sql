-- Security hardening migration (2026-07-23)
-- Addresses findings from the security audit: C1, H2/M1, M3.

-- ============================================================
-- C1 (CRITICAL): prevent tenant hijack / privilege escalation
-- ============================================================
-- The "own profile update" RLS policy restricts WHICH row a user can update
-- (auth.uid() = id) but not WHICH columns. Because there is no column
-- restriction, an authenticated user could change their own profiles.org_id
-- (to join any other tenant) or profiles.role (to become owner). Lock updates
-- down to safe columns via column-level privileges.
--
-- SECURITY DEFINER functions (create_organization, handle_new_user) run as the
-- function owner, so they are unaffected and can still set org_id/role.
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ============================================================
-- H2 + M1 (HIGH/MEDIUM): protect the WhatsApp token and org settings
-- ============================================================
-- H2: the tenant WhatsApp access token must never reach the browser. Revoke
-- column SELECT so anon/authenticated (PostgREST) cannot read it. Server code
-- uses the service-role key, which is unaffected.
revoke select (wa_access_token) on public.organizations from anon, authenticated;

-- M1: members must not change sensitive columns (WhatsApp credentials or
-- billing plan) directly. Allow only name + ai_enabled from the client; the
-- WhatsApp credentials are written by the authorized server route
-- /api/settings (service role, guarded by an owner/admin role check).
revoke update on public.organizations from anon, authenticated;
grant update (name, ai_enabled) on public.organizations to authenticated;

-- ============================================================
-- M3 (MEDIUM): basic per-tenant daily AI-reply quota
-- ============================================================
-- Bounds runaway AI cost/abuse. A production setup should add per-minute rate
-- limiting and spend alerts on top of this daily cap.
create table if not exists usage_daily (
  org_id uuid not null references organizations(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  ai_replies int not null default 0,
  primary key (org_id, day)
);

alter table usage_daily enable row level security;
create policy "org usage read" on usage_daily for select to authenticated
  using (org_id = public.current_org_id());

-- Atomically increment today's AI-reply counter for an org and report whether
-- it is still within the given daily limit. Called by server (service) code.
create or replace function public.bump_ai_usage(p_org_id uuid, p_daily_limit int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  insert into usage_daily (org_id, day, ai_replies)
  values (p_org_id, (now() at time zone 'utc')::date, 1)
  on conflict (org_id, day)
  do update set ai_replies = usage_daily.ai_replies + 1
  returning ai_replies into v_count;

  return v_count <= p_daily_limit;
end $$;

revoke all on function public.bump_ai_usage(uuid, int) from public;
grant execute on function public.bump_ai_usage(uuid, int) to service_role;
