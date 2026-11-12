-- Blockyard — initial schema + Row Level Security (migration 0001)
-- Derives column shapes from src/lib/studio/types.ts (PlaceState,
-- CustomToolData…) and platform.ts (PublishedGame, PlaceCollab).
-- Safe to re-run: idempotent guards included where practical.

-- ============================ PROFILES ============================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (char_length(username) between 3 and 20 and username ~ '^[a-zA-Z0-9_]+$'),
  display_name text not null default '' check (char_length(display_name) <= 32),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_url text,
  is_admin boolean not null default false,          -- server-controlled, never client-writable
  robux integer not null default 0 check (robux >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auto-create a profile row whenever an auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'username',
      new.raw_user_meta_data ->> 'preferred_username',
      regexp_replace(lower(new.email), '[^a-z0-9_]', '', 'g')
    ),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'username', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================== EXPERIENCES ===========================
create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  icon text not null default '🎮' check (char_length(icon) <= 8),
  gradient text not null default 'from-[#1d4ed8] to-[#1e3a8a]',
  genre text not null default 'All',
  template_id text not null default 'baseplate',
  -- publication state: draft = private, published = listed
  published boolean not null default false,
  featured boolean not null default false,          -- admin-controlled
  visits integer not null default 0,
  likes integer not null default 0,
  active_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists experiences_owner_idx on public.experiences (owner_id);
create index if not exists experiences_published_idx on public.experiences (published) where published;

-- ======================= EXPERIENCE VERSIONS =======================
-- Revision history of serialized PlaceState snapshots (never overwrite).
create table if not exists public.experience_versions (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  version integer not null check (version > 0),
  created_by uuid not null references public.profiles (id),
  -- full serialized PlaceState (parts/models/scripts/assets/tools).
  -- Bounded in size by the API route, not by the DB.
  snapshot jsonb not null,
  snapshot_bytes integer not null default 0 check (snapshot_bytes >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (experience_id, version)
);

create index if not exists experience_versions_exp_idx on public.experience_versions (experience_id, version desc);

-- ==================== EXPERIENCE COLLABORATORS =====================
-- Granular Team Create roles (mirrors CollabRole in types.ts).
create table if not exists public.experience_collaborators (
  experience_id uuid not null references public.experiences (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('viewer', 'builder', 'editor')),
  created_at timestamptz not null default now(),
  primary key (experience_id, user_id)
);

create index if not exists collaborators_user_idx on public.experience_collaborators (user_id);

-- ============================ FRIENDSHIPS ==========================
create table if not exists public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- ============================== ASSETS =============================
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('model', 'map', 'animation')),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  storage_path text,                                -- Supabase Storage object path (private bucket)
  metadata jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assets_owner_idx on public.assets (owner_id);

-- ======================= MODERATION ACTIONS ========================
create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id),
  action text not null check (char_length(action) <= 120),
  detail text not null default '' check (char_length(detail) <= 500),
  created_at timestamptz not null default now()
);

-- ===================== ROW LEVEL SECURITY =========================
alter table public.profiles enable row level security;
alter table public.experiences enable row level security;
alter table public.experience_versions enable row level security;
alter table public.experience_collaborators enable row level security;
alter table public.friendships enable row level security;
alter table public.assets enable row level security;
alter table public.moderation_actions enable row level security;

-- Explicit grants (RLS does not remove privileges; anon gets none beyond
-- what the policies allow through the API roles).
grant select on public.profiles to anon, authenticated;
grant select, insert, update on public.experiences to authenticated;
grant select, insert, update on public.experience_versions to authenticated;
grant select, insert, update, delete on public.experience_collaborators to authenticated;
grant select, insert, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.assets to authenticated;
-- moderation: admins only (server-verified); anon gets nothing
grant select on public.moderation_actions to authenticated;

-- ---------- PROFILES policies ----------
drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable"
  on public.profiles for select
  using (true);  -- public profile fields only; email/is_admin never exposed via views

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id and is_admin = false and robux = 0);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- privilege fields can never be escalated by the client
    and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())
    and robux = (select p.robux from public.profiles p where p.id = auth.uid())
  );

-- ---------- EXPERIENCES policies ----------
drop policy if exists "published experiences are public" on public.experiences;
create policy "published experiences are public"
  on public.experiences for select
  using (published = true or owner_id = auth.uid()
         or exists (
           select 1 from public.experience_collaborators c
           where c.experience_id = experiences.id and c.user_id = auth.uid()
         ));

drop policy if exists "owners create experiences" on public.experiences;
create policy "owners create experiences"
  on public.experiences for insert
  with check (owner_id = auth.uid());

drop policy if exists "owners update own experiences" on public.experiences;
create policy "owners update own experiences"
  on public.experiences for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "collaborators of editor role can update" on public.experiences;
create policy "collaborators of editor role can update"
  on public.experiences for update
  using (
    exists (
      select 1 from public.experience_collaborators c
      where c.experience_id = experiences.id and c.user_id = auth.uid() and c.role = 'editor'
    )
  );

drop policy if exists "owners delete own experiences" on public.experiences;
create policy "owners delete own experiences"
  on public.experiences for delete
  using (owner_id = auth.uid());

-- ---------- EXPERIENCE VERSIONS policies ----------
drop policy if exists "versions visible to owner and collaborators" on public.experience_versions;
create policy "versions visible to owner and collaborators"
  on public.experience_versions for select
  using (
    exists (
      select 1 from public.experiences e
      where e.id = experience_versions.experience_id
        and (e.owner_id = auth.uid() or e.published = true
             or exists (
               select 1 from public.experience_collaborators c
               where c.experience_id = e.id and c.user_id = auth.uid()
             ))
    )
  );

drop policy if exists "owner or editor inserts versions" on public.experience_versions;
create policy "owner or editor inserts versions"
  on public.experience_versions for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.experiences e
      where e.id = experience_versions.experience_id
        and (e.owner_id = auth.uid()
             or exists (
               select 1 from public.experience_collaborators c
               where c.experience_id = e.id and c.user_id = auth.uid() and c.role = 'editor'
             ))
    )
  );

-- ---------- EXPERIENCE COLLABORATORS policies ----------
-- Mirrors Team Create: owner manages the list; collaborators can read it.
drop policy if exists "collaborator list visible to owner and collaborators" on public.experience_collaborators;
create policy "collaborator list visible to owner and collaborators"
  on public.experience_collaborators for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.experiences e
      where e.id = experience_collaborators.experience_id and e.owner_id = auth.uid()
    )
  );

drop policy if exists "owner manages collaborators" on public.experience_collaborators;
create policy "owner manages collaborators"
  on public.experience_collaborators for all
  using (
    exists (
      select 1 from public.experiences e
      where e.id = experience_collaborators.experience_id and e.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.experiences e
      where e.id = experience_collaborators.experience_id and e.owner_id = auth.uid()
    )
  );

-- ---------- FRIENDSHIPS policies ----------
drop policy if exists "friendships visible to participants" on public.friendships;
create policy "friendships visible to participants"
  on public.friendships for select
  using (auth.uid() in (user_id, friend_id));

drop policy if exists "users create own friendships" on public.friendships;
create policy "users create own friendships"
  on public.friendships for insert
  with check (auth.uid() = user_id);

drop policy if exists "users delete own friendships" on public.friendships;
create policy "users delete own friendships"
  on public.friendships for delete
  using (auth.uid() in (user_id, friend_id));

-- ---------- ASSETS policies ----------
drop policy if exists "published assets are public" on public.assets;
create policy "published assets are public"
  on public.assets for select
  using (published = true or owner_id = auth.uid());

drop policy if exists "owners manage assets" on public.assets;
create policy "owners manage assets"
  on public.assets for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------- MODERATION policies ----------
-- Admin flag lives in profiles (server-controlled); policy reads it.
drop policy if exists "admins read moderation log" on public.moderation_actions;
create policy "admins read moderation log"
  on public.moderation_actions for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "admins write moderation log" on public.moderation_actions;
create policy "admins write moderation log"
  on public.moderation_actions for insert
  with check (
    admin_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ========================= STORAGE BUCKETS ========================
-- Private project files; public thumbnails only if intentionally public.
insert into storage.buckets (id, name, public)
values ('experience-files', 'experience-files', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('experience-thumbnails', 'experience-thumbnails', true)
on conflict (id) do nothing;

-- Owner-scoped uploads: users can only write under their own uid folder.
drop policy if exists "owner-scoped experience file uploads" on storage.objects;
create policy "owner-scoped experience file uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'experience-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "owner reads own experience files" on storage.objects;
create policy "owner reads own experience files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'experience-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "public thumbnails readable" on storage.objects;
create policy "public thumbnails readable"
  on storage.objects for select
  using (bucket_id = 'experience-thumbnails');

drop policy if exists "owner-scoped thumbnail uploads" on storage.objects;
create policy "owner-scoped thumbnail uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'experience-thumbnails'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
