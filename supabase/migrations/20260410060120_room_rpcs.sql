-- RPC: create_room
-- Creates a room and assigns the creator as ADMIN atomically.
create or replace function public.create_room(
  p_name text,
  p_description text default null,
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
begin
  -- Generate unique 6-char invite code
  loop
    v_invite_code := '';
    for i in 1..6 loop
      v_invite_code := v_invite_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;

    select exists(select 1 from public.rooms where invite_code = v_invite_code) into v_exists;
    exit when not v_exists;
  end loop;

  -- Insert room
  insert into public.rooms (name, description, invite_code, created_by, chip_limit)
  values (p_name, p_description, v_invite_code, auth.uid(), p_chip_limit)
  returning * into v_room;

  -- Insert creator as ADMIN member
  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'ADMIN');

  return v_room;
end;
$$;

-- RPC: join_room_via_invite
-- Validates invite code, prevents duplicates, and adds user as PLAYER.
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

  if v_room.status != 'ACTIVE' then
    raise exception 'Room is not active' using errcode = 'P0002';
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

-- Restrictive RLS policies: force all mutations through RPCs
-- (SECURITY DEFINER functions bypass RLS, so RPCs still work)

create policy "No direct room inserts"
on public.rooms for insert
with check (false);

create policy "No direct room updates"
on public.rooms for update
using (false);

create policy "No direct room_member inserts"
on public.room_members for insert
with check (false);

create policy "No direct room_member deletes"
on public.room_members for delete
using (false);

-- Grant execute to authenticated users
grant execute on function public.create_room(text, text, int) to authenticated;
grant execute on function public.join_room_via_invite(text) to authenticated;
