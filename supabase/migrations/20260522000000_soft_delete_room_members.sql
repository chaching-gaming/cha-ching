-- Add soft-delete support for room_members to preserve participation history
-- Users can see rooms they've left in their past rooms list

-- Add left_at column for soft-delete
alter table public.room_members
add column left_at timestamptz default null;

-- Index for efficient queries on active vs left members
create index idx_room_members_left_at on public.room_members(room_id, left_at);

-- ------------------------------------------------------------
-- Update leave_room to soft-delete instead of hard delete
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
  v_already_left boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0301';
  end if;

  select role, (left_at is not null) into v_my_role, v_already_left
  from public.room_members
  where room_id = p_room_id and user_id = auth.uid();

  if v_my_role is null then
    raise exception 'You are not a member of this room' using errcode = 'P0006';
  end if;

  if v_already_left then
    raise exception 'You have already left this room' using errcode = 'P0006';
  end if;

  -- If the user is an admin, ensure they're not the last one
  if v_my_role = 'ADMIN' then
    select count(*)::int into v_admin_count
    from public.room_members
    where room_id = p_room_id and role = 'ADMIN' and left_at is null;

    if v_admin_count <= 1 then
      raise exception 'Cannot leave as the last admin. Transfer admin role to another member first.' using errcode = 'P0008';
    end if;
  end if;

  -- Soft delete: set left_at timestamp
  update public.room_members
  set left_at = now()
  where room_id = p_room_id and user_id = auth.uid();
end;
$$;

-- ------------------------------------------------------------
-- Update remove_member to soft-delete instead of hard delete
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
  v_already_left boolean;
begin
  -- Check if caller is an active admin
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and role = 'ADMIN' and left_at is null
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only an admin can remove members' using errcode = 'P0005';
  end if;

  select role, (left_at is not null) into v_target_role, v_already_left
  from public.room_members
  where room_id = p_room_id and user_id = p_target_user_id;

  if v_target_role is null then
    raise exception 'Target user is not a member of this session' using errcode = 'P0006';
  end if;

  if v_already_left then
    raise exception 'Target user has already left this session' using errcode = 'P0006';
  end if;

  if v_target_role = 'ADMIN' then
    select count(*)::int into v_admin_count
    from public.room_members
    where room_id = p_room_id and role = 'ADMIN' and left_at is null;

    if v_admin_count <= 1 then
      raise exception 'Cannot remove the last admin from the session' using errcode = 'P0008';
    end if;
  end if;

  -- Soft delete: set left_at timestamp
  update public.room_members
  set left_at = now()
  where room_id = p_room_id and user_id = p_target_user_id;
end;
$$;

-- ------------------------------------------------------------
-- Update update_member_role to only work on active members
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
  v_already_left boolean;
begin
  if p_new_role is null or p_new_role not in ('PLAYER', 'ATTESTOR', 'ADMIN') then
    raise exception 'Invalid role' using errcode = 'P0007';
  end if;

  -- Check if caller is an active admin
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and role = 'ADMIN' and left_at is null
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only an admin can change member roles' using errcode = 'P0005';
  end if;

  select role, (left_at is not null) into v_current_role, v_already_left
  from public.room_members
  where room_id = p_room_id and user_id = p_target_user_id;

  if v_current_role is null then
    raise exception 'Target user is not a member of this session' using errcode = 'P0006';
  end if;

  if v_already_left then
    raise exception 'Cannot change role of a member who has left' using errcode = 'P0006';
  end if;

  -- Cannot demote the last admin
  if v_current_role = 'ADMIN' and p_new_role <> 'ADMIN' then
    select count(*)::int into v_admin_count
    from public.room_members
    where room_id = p_room_id and role = 'ADMIN' and left_at is null;

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
-- Update reassign_admin to only work on active members
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
  v_target_left boolean;
begin
  -- Check if caller is an active admin
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid() and role = 'ADMIN' and left_at is null
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only an admin can reassign admin role' using errcode = 'P0005';
  end if;

  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = p_new_admin_user_id
  ), exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = p_new_admin_user_id and left_at is not null
  ) into v_target_exists, v_target_left;

  if not v_target_exists then
    raise exception 'Target user is not a member of this session' using errcode = 'P0006';
  end if;

  if v_target_left then
    raise exception 'Cannot reassign admin role to a member who has left' using errcode = 'P0006';
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
-- Helper function to check if user is an active member
-- (used in RLS policies and other functions)
-- ------------------------------------------------------------
create or replace function public.is_active_room_member(p_room_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id
      and user_id = p_user_id
      and left_at is null
  );
$$;

-- Grant execute to authenticated users
grant execute on function public.is_active_room_member(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- Update join_room_via_invite to allow rejoining after leaving
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
  v_existing_member_id uuid;
  v_left_at timestamptz;
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

  -- Check for existing membership (including soft-deleted)
  select id, left_at into v_existing_member_id, v_left_at
  from public.room_members
  where room_id = v_room.id and user_id = auth.uid();

  if v_existing_member_id is not null then
    if v_left_at is null then
      -- Active member - already in the room
      raise exception 'Already a member' using errcode = 'P0003';
    else
      -- Previously left - allow rejoin by clearing left_at
      update public.room_members
      set left_at = null, role = 'PLAYER', joined_at = now()
      where id = v_existing_member_id;

      return v_room;
    end if;
  end if;

  -- New member - insert record
  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'PLAYER');

  return v_room;
end;
$$;
