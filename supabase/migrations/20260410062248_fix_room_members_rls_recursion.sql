-- Fix: infinite recursion in room_members SELECT policy.
-- The old policy queried room_members from within its own RLS check,
-- which triggered RLS again on the same table → infinite loop.
--
-- Solution: a SECURITY DEFINER helper that bypasses RLS to check membership.

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

-- Replace the recursive room_members policy
drop policy "View room members" on public.room_members;

create policy "View room members"
on public.room_members for select
using (public.is_room_member(room_id));

-- Also update the rooms policy to use the helper for consistency
drop policy "Members can view rooms" on public.rooms;

create policy "Members can view rooms"
on public.rooms for select
using (public.is_room_member(id));
