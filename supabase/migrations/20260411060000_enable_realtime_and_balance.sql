-- Enable Realtime on bets and chip_requests for live activity feed.
-- Add RPC to compute user's chip balance in a room.

-- ============================================================
-- 1. Enable Realtime
-- ============================================================

alter publication supabase_realtime add table public.bets;
alter publication supabase_realtime add table public.chip_requests;

-- ============================================================
-- 2. RPC: get_my_room_balance
-- ============================================================

create or replace function public.get_my_room_balance(p_room_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)
  from public.ledger_entries
  where room_id = p_room_id and user_id = auth.uid();
$$;

grant execute on function public.get_my_room_balance(uuid) to authenticated;
