-- Fix cartesian product bug in get_all_rooms_event_stats()
-- The original version joined bets and ledger_entries together, causing row multiplication
-- This fix separates them into independent CTEs that each produce a single row

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
