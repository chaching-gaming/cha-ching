-- Personal betting history RPC:
--   * get_my_bets() - returns user's bet history with win/loss status and chip changes
--
-- Usage:
--   SELECT * FROM get_my_bets();                    -- All bets across all rooms
--   SELECT * FROM get_my_bets(p_room_id := '...');  -- Bets in specific room
--   SELECT * FROM get_my_bets(p_limit := 10, p_offset := 20); -- Pagination

-- ============================================================
-- 1. get_my_bets RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_bets(
  p_room_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  bet_id uuid,
  room_id uuid,
  room_name text,
  question text,
  my_pick text,
  stake int,
  outcome text,
  won boolean,
  chips_change int,
  status text,
  settled_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    b.id AS bet_id,
    b.room_id,
    r.name AS room_name,
    b.question,
    bs.pick AS my_pick,
    bs.stake,
    b.outcome,
    CASE
      WHEN b.status = 'SETTLED' THEN lower(trim(bs.pick)) = lower(trim(b.outcome))
      ELSE NULL
    END AS won,
    CASE
      WHEN b.status = 'SETTLED' AND lower(trim(bs.pick)) = lower(trim(b.outcome)) THEN
        -- Winner: gets share of total pool
        (SELECT sum(stake) FROM public.bet_stakes WHERE bet_id = b.id)::int /
        NULLIF((SELECT count(*) FROM public.bet_stakes WHERE bet_id = b.id AND lower(trim(pick)) = lower(trim(b.outcome))), 0)
      WHEN b.status = 'SETTLED' THEN
        -- Loser: loses their stake
        -bs.stake
      WHEN b.status = 'VOID' THEN
        -- Voided: stake returned
        0
      ELSE
        -- Pending/Open/Matched: no change yet
        NULL
    END AS chips_change,
    b.status,
    b.settled_at,
    bs.created_at
  FROM public.bet_stakes bs
  JOIN public.bets b ON b.id = bs.bet_id
  JOIN public.rooms r ON r.id = b.room_id
  WHERE bs.user_id = auth.uid()
    AND (p_room_id IS NULL OR b.room_id = p_room_id)
  ORDER BY bs.created_at DESC
  LIMIT LEAST(p_limit, 100)
  OFFSET p_offset;
$$;

REVOKE ALL ON FUNCTION public.get_my_bets(uuid, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_bets(uuid, int, int) TO authenticated;
