-- Member Stats RPC: Returns detailed statistics for a specific member in a room.
-- Used by the member profile page to display balance, net profit/loss, and generosity stats.
--
-- Access: Any current or past member of the room can view stats for any member
-- (uses `is_room_member_ever` for read access to past rooms).

CREATE OR REPLACE FUNCTION public.get_member_stats(
  p_room_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  left_at timestamptz,
  left_reason text,
  balance numeric,
  starting_chips numeric,
  chips_donated numeric,
  donation_count bigint,
  chips_received numeric,
  received_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH member_info AS (
    SELECT
      rm.user_id,
      p.display_name,
      p.avatar_url,
      rm.role,
      rm.left_at,
      rm.left_reason
    FROM public.room_members rm
    JOIN public.profiles p ON p.id = rm.user_id
    WHERE rm.room_id = p_room_id
      AND rm.user_id = p_user_id
      AND public.is_room_member_ever(p_room_id)
  ),
  room_info AS (
    SELECT r.starting_chips
    FROM public.rooms r
    WHERE r.id = p_room_id
  ),
  member_balance AS (
    SELECT COALESCE(SUM(le.amount), 0)::numeric AS balance
    FROM public.ledger_entries le
    WHERE le.room_id = p_room_id
      AND le.user_id = p_user_id
  ),
  donations_out AS (
    -- Chips donated by this member (DONATION_OUT entries are negative amounts)
    SELECT
      COALESCE(SUM(ABS(le.amount)), 0)::numeric AS chips_donated,
      COUNT(*)::bigint AS donation_count
    FROM public.ledger_entries le
    WHERE le.room_id = p_room_id
      AND le.user_id = p_user_id
      AND le.type = 'DONATION_OUT'
  ),
  donations_in AS (
    -- Chips received by this member (DONATION_IN entries are positive amounts)
    SELECT
      COALESCE(SUM(le.amount), 0)::numeric AS chips_received,
      COUNT(*)::bigint AS received_count
    FROM public.ledger_entries le
    WHERE le.room_id = p_room_id
      AND le.user_id = p_user_id
      AND le.type = 'DONATION_IN'
  )
  SELECT
    mi.user_id,
    mi.display_name,
    mi.avatar_url,
    mi.role,
    mi.left_at,
    mi.left_reason,
    mb.balance,
    ri.starting_chips,
    do.chips_donated,
    do.donation_count,
    di.chips_received,
    di.received_count
  FROM member_info mi
  CROSS JOIN room_info ri
  CROSS JOIN member_balance mb
  CROSS JOIN donations_out do
  CROSS JOIN donations_in di;
$$;

REVOKE ALL ON FUNCTION public.get_member_stats(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_stats(uuid, uuid) TO authenticated;
