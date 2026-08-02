-- Store the account email on the profile (2026-07-23)
--
-- Emails live in auth.users, so listing members previously required the GoTrue
-- admin API on every page render. On this project (asymmetric ES256 JWT keys)
-- those admin calls intermittently fail with
--   "invalid JWT: ... unrecognized JWT kid <nil> for algorithm ES256"
-- which made member lists render "—" instead of real addresses.
--
-- Keeping a synced copy on profiles makes member/user lists reliable, faster
-- (no per-user admin request), and readable under normal RLS.

alter table profiles add column if not exists email text;

-- Backfill existing profiles.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is distinct from u.email);

-- Populate on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep it in sync when the account email changes.
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Users must not rewrite their own email copy (C1 hardening keeps updates
-- limited to full_name; this documents the intent for the new column).
revoke update (email) on public.profiles from anon, authenticated;
