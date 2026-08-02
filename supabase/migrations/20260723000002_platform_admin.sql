-- Platform (super) admin support (2026-07-23)
-- Adds cross-tenant platform operators and tenant suspension.

-- ============================================================
-- Platform admins: operators who manage ALL tenants.
-- ============================================================
-- Decoupled from tenant membership (a platform admin need not belong to any
-- org). Managed exclusively by service-role server code; RLS is enabled with
-- no policies, so anon/authenticated clients cannot read or write it.
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

-- Optional helper (SECURITY DEFINER) for future RLS use; the app checks via
-- service role, so this is not required by the current code.
create or replace function public.is_platform_admin(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = p_user);
$$;
revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to authenticated, service_role;

-- ============================================================
-- Tenant suspension: platform can disable a workspace.
-- ============================================================
-- When true, the webhook skips processing inbound messages for the org.
alter table organizations add column if not exists suspended boolean not null default false;
