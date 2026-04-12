-- Per-session RBAC: member role updates and removal (admin-only, sole-admin guards).

-- ------------------------------------------------------------
-- Document: clients cannot UPDATE room_members directly
-- ------------------------------------------------------------
create policy "No direct room_member updates"
on public.room_members for update
using (false);

-- ------------------------------------------------------------
-- RPC: update_member_role
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

grant execute on function public.update_member_role(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- RPC: remove_member
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

grant execute on function public.remove_member(uuid, uuid) to authenticated;
