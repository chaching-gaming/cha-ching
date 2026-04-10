-- Sessions Refactor: Convert rooms from persistent groups to standalone sessions.
--
-- Ordering:
--   1. Schema changes (add/rename/drop columns)
--   2. Replace RPCs (referencing final column names)
--   3. New RPCs (end_session, reassign_admin)
--   4. Indexes

-- ============================================================
-- 1. Schema changes — rooms table
-- ============================================================

-- Add new session columns
alter table public.rooms add column session_date date not null default current_date;
alter table public.rooms add column is_active boolean not null default true;
alter table public.rooms add column ended_at timestamptz;

-- Remove default on session_date (RPCs always supply it explicitly)
alter table public.rooms alter column session_date drop default;

-- Rename chip_limit to per_user_chip_limit
alter table public.rooms rename column chip_limit to per_user_chip_limit;

-- Drop removed columns
alter table public.rooms drop column description;
alter table public.rooms drop column status;

-- ============================================================
-- 2. Schema changes — events table
-- ============================================================

alter table public.events drop column sport;

-- ============================================================
-- 3. Replace create_room RPC (new signature)
-- ============================================================

-- Drop old function (signature changes from text,text,int to date,int)
revoke execute on function public.create_room(text, text, int) from authenticated;
drop function if exists public.create_room(text, text, int);

create or replace function public.create_room(
  p_name text,
  p_session_date date,
  p_chip_limit int default null
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_code text;
  v_room public.rooms;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_exists boolean;
  v_full_name text;
begin
  -- Build session name: user-provided name + date
  v_full_name := p_name || ' - ' || to_char(p_session_date, 'YYYY-MM-DD');

  -- Generate unique 6-char invite code
  loop
    v_invite_code := '';
    for i in 1..6 loop
      v_invite_code := v_invite_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;

    select exists(select 1 from public.rooms where invite_code = v_invite_code) into v_exists;
    exit when not v_exists;
  end loop;

  -- Insert room as active session
  insert into public.rooms (name, invite_code, created_by, per_user_chip_limit, session_date, is_active)
  values (v_full_name, v_invite_code, auth.uid(), p_chip_limit, p_session_date, true)
  returning * into v_room;

  -- Insert creator as ADMIN member
  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'ADMIN');

  return v_room;
end;
$$;

grant execute on function public.create_room(text, date, int) to authenticated;

-- ============================================================
-- 4. Update join_room_via_invite RPC (check is_active instead of status)
-- ============================================================

create or replace function public.join_room_via_invite(
  p_invite_code text
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_already_member boolean;
begin
  -- Find room by invite code (normalize input)
  select * into v_room
  from public.rooms
  where invite_code = upper(trim(p_invite_code));

  if v_room is null then
    raise exception 'Room not found' using errcode = 'P0001';
  end if;

  if not v_room.is_active then
    raise exception 'Session is no longer active' using errcode = 'P0002';
  end if;

  -- Check for existing membership
  select exists(
    select 1 from public.room_members
    where room_id = v_room.id and user_id = auth.uid()
  ) into v_already_member;

  if v_already_member then
    raise exception 'Already a member' using errcode = 'P0003';
  end if;

  -- Add user as PLAYER
  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'PLAYER');

  return v_room;
end;
$$;

-- ============================================================
-- 5. New RPC: end_session
-- ============================================================

create or replace function public.end_session(
  p_room_id uuid
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_is_admin boolean;
begin
  select * into v_room from public.rooms where id = p_room_id;

  if v_room is null then
    raise exception 'Session not found' using errcode = 'P0001';
  end if;

  if not v_room.is_active then
    raise exception 'Session is already ended' using errcode = 'P0004';
  end if;

  -- Verify caller is admin
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and role = 'ADMIN'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only the admin can end a session' using errcode = 'P0005';
  end if;

  update public.rooms
  set is_active = false, ended_at = now()
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

grant execute on function public.end_session(uuid) to authenticated;

-- ============================================================
-- 6. New RPC: reassign_admin
-- ============================================================

create or replace function public.reassign_admin(
  p_room_id uuid,
  p_new_admin_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_new_is_member boolean;
begin
  -- Verify caller is current ADMIN
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and role = 'ADMIN'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only the admin can reassign admin' using errcode = 'P0005';
  end if;

  -- Verify target is a member
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = p_new_admin_user_id
  ) into v_new_is_member;

  if not v_new_is_member then
    raise exception 'Target user is not a member of this session' using errcode = 'P0006';
  end if;

  -- Demote current admin to PLAYER
  update public.room_members
  set role = 'PLAYER'
  where room_id = p_room_id and user_id = auth.uid();

  -- Promote new admin
  update public.room_members
  set role = 'ADMIN'
  where room_id = p_room_id and user_id = p_new_admin_user_id;
end;
$$;

grant execute on function public.reassign_admin(uuid, uuid) to authenticated;

-- ============================================================
-- 7. Indexes
-- ============================================================

create index idx_rooms_is_active on public.rooms(is_active);
