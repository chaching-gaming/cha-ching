-- Allow any member to leave a room (remove themselves).
-- The last admin cannot leave — they must transfer admin role first.

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

grant execute on function public.leave_room(uuid) to authenticated;
