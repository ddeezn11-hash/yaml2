-- Blockyard migration 0002: make Supabase Auth the only account authority.
-- Run after 0001_init.sql. Safe to re-run.

-- Moderation state is private; never expose it through the public profile query.
alter table public.profiles
  add column if not exists banned boolean not null default false,
  add column if not exists ban_reason text;

-- Username comparisons are case-insensitive. Existing installations with
-- duplicate case variants must resolve those rows before this index can apply.
create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username));

-- Supabase Auth user metadata supplies a validated username during sign-up.
-- The fallback is deterministic and always satisfies the profile constraint.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_username text;
  candidate_display text;
begin
  candidate_username := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if char_length(candidate_username) < 3
     or char_length(candidate_username) > 20
     or candidate_username !~ '^[a-zA-Z0-9_]+$'
     or exists (
       select 1 from public.profiles p
       where lower(p.username) = lower(candidate_username) and p.id <> new.id
     ) then
    candidate_username := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  candidate_display := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', candidate_username));
  if char_length(candidate_display) > 32 then
    candidate_display := substr(candidate_display, 1, 32);
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, candidate_username, candidate_display)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Do not grant browser clients table-wide profile access: that would expose
-- admin, Robux and ban flags to every signed-in/anonymous user.
revoke all on table public.profiles from anon, authenticated;
grant select (id, username, display_name, bio, avatar_url, created_at)
  on table public.profiles to anon, authenticated;

-- No client-side profile inserts or updates. The auth trigger creates profiles;
-- sensitive changes are made through trusted SQL/admin-only server functions.
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "public profile fields are readable" on public.profiles;
create policy "public profile fields are readable"
  on public.profiles for select
  using (true);

-- Returns only the authenticated caller's private account fields. The
-- SECURITY DEFINER function bypasses column grants but binds the row to auth.uid().
create or replace function public.get_my_profile()
returns table (
  id uuid,
  username text,
  display_name text,
  robux integer,
  is_admin boolean,
  banned boolean,
  ban_reason text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.robux, p.is_admin,
         p.banned, p.ban_reason, p.created_at
  from public.profiles p
  where p.id = auth.uid()
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- A public profile lookup is safe because column-level grants above expose
-- only public display fields. The application uses this for username checks.
