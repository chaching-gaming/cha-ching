-- Aggregate stats for "My Bets" view when "All Rooms" is selected
-- Returns total bets, wins, losses, and net chips across all rooms

CREATE OR REPLACE FUNCTION public.get_my_bets_aggregate_stats(
  p_room_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_bets int,
  wins int,
  losses int,
  net_chips numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COUNT(*)::int AS total_bets,
    COUNT(CASE
      WHEN b.status = 'SETTLED' AND lower(trim(bs.pick)) = lower(trim(b.outcome))
      THEN 1
    END)::int AS wins,
    COUNT(CASE
      WHEN b.status = 'SETTLED' AND lower(trim(bs.pick)) != lower(trim(b.outcome))
      THEN 1
    END)::int AS losses,
    COALESCE(SUM(
      CASE
        WHEN b.status = 'SETTLED' AND lower(trim(bs.pick)) = lower(trim(b.outcome)) THEN
          -- Winner: gets share of total pool
          (SELECT sum(stake) FROM public.bet_stakes WHERE bet_id = b.id)::numeric /
          NULLIF((SELECT count(*) FROM public.bet_stakes WHERE bet_id = b.id AND lower(trim(pick)) = lower(trim(b.outcome))), 0)
        WHEN b.status = 'SETTLED' THEN
          -- Loser: loses their stake
          -bs.stake::numeric
        ELSE
          0
      END
    ), 0)::numeric AS net_chips
  FROM public.bet_stakes bs
  JOIN public.bets b ON b.id = bs.bet_id
  WHERE bs.user_id = auth.uid()
    AND (p_room_id IS NULL OR b.room_id = p_room_id);
$$;

REVOKE ALL ON FUNCTION public.get_my_bets_aggregate_stats(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_bets_aggregate_stats(uuid) TO authenticated;
