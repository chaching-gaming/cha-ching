-- Fix losses calculation to include both legacy BET_LOSS and new STAKE_LOCK types
-- Previous migrations only checked BET_LOSS, missing all recent bet data

-- 1. Fix get_room_member_balances
DROP FUNCTION IF EXISTS public.get_room_member_balances(uuid);

CREATE OR REPLACE FUNCTION public.get_room_member_balances(p_room_id uuid)
RETURNS TABLE (
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH member_stats AS (
    SELECT
      rm.user_id,
      rm.left_at,
      COALESCE(SUM(le.amount), 0)::numeric AS balance,
      COUNT(DISTINCT CASE WHEN le.type = 'BET_WIN' THEN le.bet_id END)::int AS wins,
      COUNT(DISTINCT CASE
        WHEN le.type IN ('BET_LOSS', 'STAKE_LOCK') AND b.status = 'SETTLED' THEN le.bet_id
      END)::int AS stakes_in_settled
    FROM public.room_members rm
    LEFT JOIN public.ledger_entries le
      ON le.room_id = rm.room_id AND le.user_id = rm.user_id
    LEFT JOIN public.bets b ON b.id = le.bet_id
    WHERE rm.room_id = p_room_id
      AND public.is_room_member_ever(p_room_id)
    GROUP BY rm.user_id, rm.left_at
  ),
  room_info AS (
    SELECT starting_chips FROM public.rooms WHERE id = p_room_id
  )
  SELECT
    ms.user_id,
    p.display_name,
    p.avatar_url,
    ms.balance,
    ms.wins,
    GREATEST(ms.stakes_in_settled - ms.wins, 0)::int AS losses,
    (ms.balance - ri.starting_chips)::numeric AS net_balance,
    s.status AS settlement_status,
    ms.left_at
  FROM member_stats ms
  JOIN public.profiles p ON p.id = ms.user_id
  CROSS JOIN room_info ri
  LEFT JOIN public.member_settlements s
    ON s.room_id = p_room_id AND s.user_id = ms.user_id
  ORDER BY ms.balance DESC, p.display_name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_room_member_balances(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_room_member_balances(uuid) TO authenticated;


-- 2. Fix get_all_rooms_player_stats
CREATE OR REPLACE FUNCTION public.get_all_rooms_player_stats()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  total_net_balance numeric,
  total_wins int,
  total_losses int,
  rooms_count int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH user_rooms AS (
    SELECT DISTINCT room_id
    FROM public.room_members
    WHERE user_id = auth.uid()
  ),
  player_room_stats AS (
    SELECT
      rm.user_id,
      rm.room_id,
      COALESCE(SUM(le.amount), 0) AS balance,
      r.starting_chips,
      COUNT(DISTINCT CASE WHEN le.type = 'BET_WIN' THEN le.bet_id END)::int AS wins,
      COUNT(DISTINCT CASE
        WHEN le.type IN ('BET_LOSS', 'STAKE_LOCK') AND b.status = 'SETTLED' THEN le.bet_id
      END)::int AS stakes_in_settled
    FROM user_rooms ur
    JOIN public.room_members rm ON rm.room_id = ur.room_id
    JOIN public.rooms r ON r.id = rm.room_id
    LEFT JOIN public.ledger_entries le
      ON le.room_id = rm.room_id AND le.user_id = rm.user_id
    LEFT JOIN public.bets b ON b.id = le.bet_id
    GROUP BY rm.user_id, rm.room_id, r.starting_chips
  ),
  player_aggregates AS (
    SELECT
      prs.user_id,
      SUM(prs.balance - prs.starting_chips)::numeric AS total_net_balance,
      SUM(prs.wins)::int AS total_wins,
      SUM(GREATEST(prs.stakes_in_settled - prs.wins, 0))::int AS total_losses,
      COUNT(DISTINCT prs.room_id)::int AS rooms_count
    FROM player_room_stats prs
    GROUP BY prs.user_id
  )
  SELECT
    pa.user_id,
    p.display_name,
    p.avatar_url,
    pa.total_net_balance,
    pa.total_wins,
    pa.total_losses,
    pa.rooms_count
  FROM player_aggregates pa
  JOIN public.profiles p ON p.id = pa.user_id
  ORDER BY pa.total_net_balance DESC, p.display_name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_all_rooms_player_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_all_rooms_player_stats() TO authenticated;
