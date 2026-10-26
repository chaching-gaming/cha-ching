-- Fix: Allow past members to view standings in closed rooms
-- Change is_room_member() to is_room_member_ever() in get_room_member_balances()

drop function if exists public.get_room_member_balances(uuid);

create or replace function public.get_room_member_balances(p_room_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  balance numeric,
  wins int,
  losses int,
  net_balance numeric,
  settlement_status text,
  left_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with member_stats as (
    select
      rm.user_id,
      rm.left_at,
      coalesce(sum(le.amount), 0)::numeric as balance,
      count(distinct case when le.type = 'BET_WIN' then le.bet_id end)::int as wins,
      count(distinct case
        when le.type = 'BET_LOSS' and b.status = 'SETTLED' then le.bet_id
      end)::int as stakes_in_settled
    from public.room_members rm
    left join public.ledger_entries le
      on le.room_id = rm.room_id and le.user_id = rm.user_id
    left join public.bets b on b.id = le.bet_id
    where rm.room_id = p_room_id
      and public.is_room_member_ever(p_room_id)  -- Changed from is_room_member to allow past members
    group by rm.user_id, rm.left_at
  ),
  room_info as (
    select starting_chips from public.rooms where id = p_room_id
  )
  select
    ms.user_id,
    p.display_name,
    p.avatar_url,
    ms.balance,
    ms.wins,
    greatest(ms.stakes_in_settled - ms.wins, 0)::int as losses,
    (ms.balance - ri.starting_chips)::numeric as net_balance,
    s.status as settlement_status,
    ms.left_at
  from member_stats ms
  join public.profiles p on p.id = ms.user_id
  cross join room_info ri
  left join public.member_settlements s
    on s.room_id = p_room_id and s.user_id = ms.user_id
  order by ms.balance desc, p.display_name asc;
$$;

revoke all on function public.get_room_member_balances(uuid) from public;
grant execute on function public.get_room_member_balances(uuid) to authenticated;
