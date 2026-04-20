-- Extend get_room_member_balances with per-member wins / losses counts.
--
-- Definitions (post-rename):
--   wins   = distinct bets where the user has a BET_WIN ledger row
--   losses = distinct bets where the user has a BET_LOSS ledger row on a
--            SETTLED bet AND did not receive a BET_WIN for that bet
--
-- Void / disputed / pending bets do not count either way. The computation is
-- cheap: a single pass over ledger_entries per user, joined to bets for status
-- filtering. Uses the existing (room_id, user_id) composite index.

drop function if exists public.get_room_member_balances(uuid);

create or replace function public.get_room_member_balances(p_room_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  balance numeric,
  wins int,
  losses int
)
language sql
security definer
set search_path = public
stable
as $$
  with member_stats as (
    select
      rm.user_id,
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
      and public.is_room_member(p_room_id)
    group by rm.user_id
  )
  select
    ms.user_id,
    p.display_name,
    p.avatar_url,
    ms.balance,
    ms.wins,
    greatest(ms.stakes_in_settled - ms.wins, 0)::int as losses
  from member_stats ms
  join public.profiles p on p.id = ms.user_id
  order by ms.balance desc, p.display_name asc;
$$;

revoke all on function public.get_room_member_balances(uuid) from public;
grant execute on function public.get_room_member_balances(uuid) to authenticated;
