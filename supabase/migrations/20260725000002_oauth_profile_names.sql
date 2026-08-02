-- Make the signup trigger OAuth-aware (2026-07-25)
--
-- handle_new_user() only read raw_user_meta_data->>'full_name', which is set by
-- our own email sign-up form (options.data.full_name). Google/OIDC sign-ins
-- populate different keys: Supabase copies the provider's `name` claim, and
-- depending on the provider only `name` (not `full_name`) is present. When
-- neither existed the profile was created with a NULL name, so member lists and
-- the account panel rendered a blank user.
--
-- Fall back through the known keys, then to the local part of the email so a
-- profile always has something human-readable to display.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data->>'full_name',  -- our email sign-up form
          new.raw_user_meta_data->>'name',       -- Google / generic OIDC claim
          concat_ws(
            ' ',
            new.raw_user_meta_data->>'given_name',
            new.raw_user_meta_data->>'family_name'
          ),
          split_part(coalesce(new.email, ''), '@', 1)  -- last resort
        )
      ),
      ''
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Backfill profiles that were created without a display name (e.g. an OAuth
-- sign-in before this fix). Never overwrites a name the user already has.
update public.profiles p
set full_name = nullif(
  trim(
    coalesce(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      concat_ws(
        ' ',
        u.raw_user_meta_data->>'given_name',
        u.raw_user_meta_data->>'family_name'
      ),
      split_part(coalesce(u.email, ''), '@', 1)
    )
  ),
  ''
)
from auth.users u
where u.id = p.id
  and (p.full_name is null or trim(p.full_name) = '');
