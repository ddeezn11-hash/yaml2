-- Blockyard RLS regression tests (plain SQL, no pgtap required).
-- Run against a Supabase project/Postgres with the auth schema present:
--   supabase db push            (apply migrations)
--   supabase db reset           (local) or paste into SQL editor
--   then run this file and expect no raised exceptions.
-- Simulates two users (A, B), an anon visitor and privilege-escalation
-- attempts. Every assertion raises on failure.

begin;

-- fixtures: two auth users (in real Supabase these exist in auth.users)
insert into auth.users (id, email, encrypted_password, raw_user_meta_data, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'x', '{"username":"usera"}'::jsonb, 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'x', '{"username":"userb"}'::jsonb, 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- trigger should have created profiles
do $$
declare
  n integer;
begin
  select count(*) into n from public.profiles
   where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  if n < 2 then
    raise exception 'FAIL: profile trigger did not create rows for new auth users';
  end if;
end $$;

-- helper to act as a user
create or replace function test.as_user(uid text)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
end $$;

create or replace function test.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
end $$;

create schema if not exists test;

-- ---------------- TEST 1: anon cannot read unpublished ----------------
perform test.as_anon();
do $$
declare c integer;
begin
  -- owner-scoped data first
  perform test.as_user('11111111-1111-1111-1111-111111111111');
  insert into public.experiences (id, owner_id, title, published)
  values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'Private Place', false);

  perform test.as_anon();
  select count(*) into c from public.experiences where id = '99999999-9999-9999-9999-999999999999';
  if c <> 0 then
    raise exception 'FAIL: anon read an unpublished experience (CWE-862)';
  end if;
end $$;

-- ---------------- TEST 2: B cannot read A's unpublished experience ----------------
do $$
declare c integer;
begin
  perform test.as_user('22222222-2222-2222-2222-222222222222');
  select count(*) into c from public.experiences where id = '99999999-9999-9999-9999-999999999999';
  if c <> 0 then
    raise exception 'FAIL: user B read user A''s private experience (IDOR/CWE-639)';
  end if;
end $$;

-- ---------------- TEST 3: B cannot claim A's experience ----------------
do $$
begin
  perform test.as_user('22222222-2222-2222-2222-222222222222');
  begin
    insert into public.experiences (owner_id, title, published)
    values ('11111111-1111-1111-1111-111111111111', 'Stolen', false);
    raise exception 'FAIL: user B created an experience owned by A (mass assignment/CWE-915)';
  exception
    when check_violation or insufficient_privilege or unique_violation then
      null; -- expected
  end;
end $$;

-- ---------------- TEST 4: privilege escalation via profile update ----------------
do $$
begin
  perform test.as_user('22222222-2222-2222-2222-222222222222');
  update public.profiles set is_admin = true
   where id = '22222222-2222-2222-2222-222222222222';
  if exists (select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222' and is_admin) then
    raise exception 'FAIL: user B escalated to admin via profile update (CWE-269)';
  end if;
end $$;

-- ---------------- TEST 5: collaborator rules ----------------
do $$
begin
  -- A adds B as builder
  perform test.as_user('11111111-1111-1111-1111-111111111111');
  insert into public.experience_collaborators (experience_id, user_id, role)
  values ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', 'builder');

  -- builder can now SEE the private experience
  perform test.as_user('22222222-2222-2222-2222-222222222222');
  if not exists (select 1 from public.experiences where id = '99999999-9999-9999-9999-999999999999') then
    raise exception 'FAIL: builder cannot see the shared experience';
  end if;

  -- but builder CANNOT add collaborators (owner-only)
  begin
    insert into public.experience_collaborators (experience_id, user_id, role)
    values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'editor');
    raise exception 'FAIL: builder modified the collaborator list (CWE-863)';
  exception
    when insufficient_privilege then null; -- expected
  end;
end $$;

-- ---------------- TEST 6: friendships are private ----------------
do $$
begin
  perform test.as_user('11111111-1111-1111-1111-111111111111');
  insert into public.friendships (user_id, friend_id)
  values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

  perform test.as_anon();
  if exists (select 1 from public.friendships) then
    raise exception 'FAIL: anon can read friendships';
  end if;
end $$;

-- ---------------- TEST 7: moderation log needs admin ----------------
do $$
begin
  perform test.as_user('22222222-2222-2222-2222-222222222222');
  if exists (select 1 from public.moderation_actions) then
    raise exception 'FAIL: non-admin can read the moderation log';
  end if;
end $$;

-- cleanup fixtures
perform test.as_anon();
delete from public.experiences where id = '99999999-9999-9999-9999-999999999999';
delete from public.friendships;
delete from public.profiles where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
drop function if exists test.as_user(text);
drop function if exists test.as_anon();

commit;

-- If you reached this line, every RLS regression test passed.
select 'ALL RLS REGRESSION TESTS PASSED' as result;
