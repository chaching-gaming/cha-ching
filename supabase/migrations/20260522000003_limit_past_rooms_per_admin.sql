-- Limit past/inactive rooms to 10 per admin/creator
-- When a room becomes inactive, if the admin has more than 10 inactive rooms,
-- automatically delete the oldest ones to stay within the limit.

-- ============================================================
-- 1. Function to prune excess inactive rooms for a given admin
-- ============================================================

create or replace function public.prune_excess_inactive_rooms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_inactive_count integer;
  v_excess_count integer;
begin
  -- Only act when is_active transitions from true to false
  if not (OLD.is_active = true and NEW.is_active = false) then
    return NEW;
  end if;

  v_admin_id := NEW.created_by;

  -- Count inactive rooms for this admin (including the one just deactivated)
  select count(*) into v_inactive_count
  from public.rooms
  where created_by = v_admin_id
    and is_active = false;

  -- If within limit, nothing to do
  if v_inactive_count <= 10 then
    return NEW;
  end if;

  -- Delete oldest inactive rooms beyond the limit
  v_excess_count := v_inactive_count - 10;

  delete from public.rooms
  where id in (
    select id
    from public.rooms
    where created_by = v_admin_id
      and is_active = false
      and id != NEW.id  -- Don't delete the room that was just deactivated
    order by ended_at asc nulls first, created_at asc
    limit v_excess_count
  );

  return NEW;
end;
$$;

-- ============================================================
-- 2. Create trigger on rooms table
-- ============================================================

drop trigger if exists trg_prune_excess_inactive_rooms on public.rooms;

create trigger trg_prune_excess_inactive_rooms
  after update of is_active on public.rooms
  for each row
  execute function public.prune_excess_inactive_rooms();

-- ============================================================
-- 3. Index to speed up inactive room queries per admin
-- ============================================================

create index if not exists idx_rooms_created_by_inactive
  on public.rooms (created_by, ended_at)
  where is_active = false;
