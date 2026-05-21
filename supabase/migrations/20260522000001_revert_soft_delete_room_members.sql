-- Revert soft-delete changes for room_members
-- This migration undoes 20260522000000_soft_delete_room_members.sql

-- ------------------------------------------------------------
-- Drop the helper function
-- ------------------------------------------------------------
drop function if exists public.is_active_room_member(uuid, uuid);

-- ------------------------------------------------------------
-- Revert join_room_via_invite to original (no rejoin logic)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Revert reassign_admin to original (no left_at checks)
-- ------------------------------------------------------------
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
  v_target_exists boolean;
begin
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and role = 'ADMIN'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only an admin can reassign admin role' using errcode = 'P0005';
  end if;

  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = p_new_admin_user_id
  ) into v_target_exists;

  if not v_target_exists then
    raise exception 'Target user is not a member of this session' using errcode = 'P0006';
  end if;

  -- Demote caller to PLAYER and promote target to ADMIN
  update public.room_members
  set role = 'PLAYER'
  where room_id = p_room_id and user_id = auth.uid();

  update public.room_members
  set role = 'ADMIN'
  where room_id = p_room_id and user_id = p_new_admin_user_id;
end;
$$;

-- ------------------------------------------------------------
-- Revert update_member_role to original (no left_at checks)
-- ------------------------------------------------------------
create or replace function public.update_member_role(
  p_room_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_current_role text;
  v_admin_count int;
begin
  if p_new_role is null or p_new_role not in ('PLAYER', 'ATTESTOR', 'ADMIN') then
    raise exception 'Invalid role' using errcode = 'P0007';
  end if;

  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and role = 'ADMIN'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only an admin can change member roles' using errcode = 'P0005';
  end if;

  select role into v_current_role
  from public.room_members
  where room_id = p_room_id and user_id = p_target_user_id;

  if v_current_role is null then
    raise exception 'Target user is not a member of this session' using errcode = 'P0006';
  end if;

  -- Cannot demote the last admin
  if v_current_role = 'ADMIN' and p_new_role <> 'ADMIN' then
    select count(*)::int into v_admin_count
    from public.room_members
    where room_id = p_room_id and role = 'ADMIN';

    if v_admin_count <= 1 then
      raise exception 'Cannot remove the last admin role from the session' using errcode = 'P0008';
    end if;
  end if;

  update public.room_members
  set role = p_new_role
  where room_id = p_room_id and user_id = p_target_user_id;
end;
$$;

-- ------------------------------------------------------------
-- Revert remove_member to hard delete
-- ------------------------------------------------------------
create or replace function public.remove_member(
  p_room_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_target_role text;
  v_admin_count int;
begin
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and role = 'ADMIN'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only an admin can remove members' using errcode = 'P0005';
  end if;

  select role into v_target_role
  from public.room_members
  where room_id = p_room_id and user_id = p_target_user_id;

  if v_target_role is null then
    raise exception 'Target user is not a member of this session' using errcode = 'P0006';
  end if;

  if v_target_role = 'ADMIN' then
    select count(*)::int into v_admin_count
    from public.room_members
    where room_id = p_room_id and role = 'ADMIN';

    if v_admin_count <= 1 then
      raise exception 'Cannot remove the last admin from the session' using errcode = 'P0008';
    end if;
  end if;

  delete from public.room_members
  where room_id = p_room_id and user_id = p_target_user_id;
end;
$$;

-- ------------------------------------------------------------
-- Revert leave_room to hard delete
-- ------------------------------------------------------------
create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_my_role text;
  v_admin_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0301';
  end if;

  select role into v_my_role
  from public.room_members
  where room_id = p_room_id and user_id = auth.uid();

  if v_my_role is null then
    raise exception 'You are not a member of this room' using errcode = 'P0006';
  end if;

  -- If the user is an admin, ensure they're not the last one
  if v_my_role = 'ADMIN' then
    select count(*)::int into v_admin_count
    from public.room_members
    where room_id = p_room_id and role = 'ADMIN';

    if v_admin_count <= 1 then
      raise exception 'Cannot leave as the last admin. Transfer admin role to another member first.' using errcode = 'P0008';
    end if;
  end if;

  delete from public.room_members
  where room_id = p_room_id and user_id = auth.uid();
end;
$$;

-- ------------------------------------------------------------
-- Drop the index and column
-- ------------------------------------------------------------
drop index if exists idx_room_members_left_at;

alter table public.room_members
drop column if exists left_at;
