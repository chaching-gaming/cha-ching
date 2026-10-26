-- Cross-room aggregate stats for "All Rooms" view in Stats tab
-- Allows users to see their aggregate performance across all rooms they're a member of

-- 1. Aggregate player stats across all rooms the user has been a member of
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
    -- Get all rooms the current user has been a member of (active or past)
    SELECT DISTINCT room_id
    FROM public.room_members
    WHERE user_id = auth.uid()
  ),
  player_room_stats AS (
    -- For each player in those rooms, calculate their per-room stats
    SELECT
      rm.user_id,
      rm.room_id,
      COALESCE(SUM(le.amount), 0) AS balance,
      r.starting_chips,
      COUNT(DISTINCT CASE WHEN le.type = 'BET_WIN' THEN le.bet_id END)::int AS wins,
      COUNT(DISTINCT CASE
        WHEN le.type = 'BET_LOSS' AND b.status = 'SETTLED' THEN le.bet_id
      END)::int AS losses
    FROM user_rooms ur
    JOIN public.room_members rm ON rm.room_id = ur.room_id
    JOIN public.rooms r ON r.id = rm.room_id
    LEFT JOIN public.ledger_entries le
      ON le.room_id = rm.room_id AND le.user_id = rm.user_id
    LEFT JOIN public.bets b ON b.id = le.bet_id
    GROUP BY rm.user_id, rm.room_id, r.starting_chips
  ),
  player_aggregates AS (
    -- Aggregate across all rooms per player
    SELECT
      prs.user_id,
      SUM(prs.balance - prs.starting_chips)::numeric AS total_net_balance,
      SUM(prs.wins)::int AS total_wins,
      SUM(prs.losses)::int AS total_losses,
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

-- 2. Aggregate event stats across all rooms the user has been a member of
CREATE OR REPLACE FUNCTION public.get_all_rooms_event_stats()
RETURNS TABLE (
  total_rooms int,
  total_bets int,
  settled_bets int,
  total_chips_wagered numeric,
  total_donations numeric
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
  -- Aggregate bets separately to avoid cartesian product
  bet_stats AS (
    SELECT
      COUNT(DISTINCT b.id)::int AS total_bets,
      COUNT(DISTINCT CASE WHEN b.status = 'SETTLED' THEN b.id END)::int AS settled_bets
    FROM user_rooms ur
    JOIN public.bets b ON b.room_id = ur.room_id
  ),
  -- Aggregate ledger entries separately
  ledger_stats AS (
    SELECT
      COALESCE(SUM(
        CASE WHEN le.type IN ('BET_STAKE', 'COUNTER_STAKE') THEN ABS(le.amount) ELSE 0 END
      ), 0)::numeric AS total_chips_wagered,
      COALESCE(SUM(
        CASE WHEN le.type = 'DONATION_OUT' THEN ABS(le.amount) ELSE 0 END
      ), 0)::numeric AS total_donations
    FROM user_rooms ur
    JOIN public.ledger_entries le ON le.room_id = ur.room_id
  )
  SELECT
    (SELECT COUNT(*)::int FROM user_rooms) AS total_rooms,
    bs.total_bets,
    bs.settled_bets,
    ls.total_chips_wagered,
    ls.total_donations
  FROM bet_stats bs
  CROSS JOIN ledger_stats ls;
$$;

REVOKE ALL ON FUNCTION public.get_all_rooms_event_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_all_rooms_event_stats() TO authenticated;
