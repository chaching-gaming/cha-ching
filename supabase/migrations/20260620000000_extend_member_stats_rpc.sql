-- Extends get_member_stats with: joined_at, settlement_status, wins, losses,
-- total_wagered, biggest_win_net, biggest_loss_net.

DROP FUNCTION IF EXISTS public.get_member_stats(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_member_stats(
  p_room_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  joined_at timestamptz,
  left_at timestamptz,
  left_reason text,
  balance numeric,
  starting_chips numeric,
  chips_donated numeric,
  donation_count bigint,
  chips_received numeric,
  received_count bigint,
  settlement_status text,
  wins bigint,
  losses bigint,
  total_wagered numeric,
  biggest_win_net numeric,
  biggest_loss_net numeric
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
      rm.joined_at,
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
    SELECT
      COALESCE(SUM(ABS(le.amount)), 0)::numeric AS chips_donated,
      COUNT(*)::bigint AS donation_count
    FROM public.ledger_entries le
    WHERE le.room_id = p_room_id
      AND le.user_id = p_user_id
      AND le.type = 'DONATION_OUT'
  ),
  donations_in AS (
    SELECT
      COALESCE(SUM(le.amount), 0)::numeric AS chips_received,
      COUNT(*)::bigint AS received_count
    FROM public.ledger_entries le
    WHERE le.room_id = p_room_id
      AND le.user_id = p_user_id
      AND le.type = 'DONATION_IN'
  ),
  settlement AS (
    SELECT ms.status AS settlement_status
    FROM public.member_settlements ms
    WHERE ms.room_id = p_room_id
      AND ms.user_id = p_user_id
  ),
  bet_wins AS (
    SELECT COUNT(*)::bigint AS wins
    FROM public.ledger_entries le
    WHERE le.room_id = p_room_id
      AND le.user_id = p_user_id
      AND le.type = 'BET_WIN'
  ),
  -- Settled bets where user had a STAKE_LOCK but received no BET_WIN
  bet_losses AS (
    SELECT COUNT(DISTINCT le.bet_id)::bigint AS losses
    FROM public.ledger_entries le
    JOIN public.bets b ON b.id = le.bet_id
    WHERE le.room_id = p_room_id
      AND le.user_id = p_user_id
      AND le.type = 'STAKE_LOCK'
      AND b.status = 'SETTLED'
      AND NOT EXISTS (
        SELECT 1 FROM public.ledger_entries le2
        WHERE le2.bet_id = le.bet_id
          AND le2.user_id = le.user_id
          AND le2.type = 'BET_WIN'
      )
  ),
  wagering AS (
    SELECT COALESCE(SUM(ABS(le.amount)), 0)::numeric AS total_wagered
    FROM public.ledger_entries le
    WHERE le.room_id = p_room_id
      AND le.user_id = p_user_id
      AND le.type = 'STAKE_LOCK'
  ),
  -- Net profit per won bet = BET_WIN + STAKE_LOCK (STAKE_LOCK is negative)
  win_stats AS (
    SELECT COALESCE(MAX(le_win.amount + le_lock.amount), 0)::numeric AS biggest_win_net
    FROM public.ledger_entries le_win
    JOIN public.ledger_entries le_lock
      ON le_lock.bet_id = le_win.bet_id
      AND le_lock.user_id = le_win.user_id
      AND le_lock.type = 'STAKE_LOCK'
    WHERE le_win.type = 'BET_WIN'
      AND le_win.room_id = p_room_id
      AND le_win.user_id = p_user_id
  ),
  -- Largest single stake lost (settled bets where user had no BET_WIN)
  loss_stats AS (
    SELECT COALESCE(MAX(ABS(le.amount)), 0)::numeric AS biggest_loss_net
    FROM public.ledger_entries le
    JOIN public.bets b ON b.id = le.bet_id
    WHERE le.type = 'STAKE_LOCK'
      AND le.room_id = p_room_id
      AND le.user_id = p_user_id
      AND b.status = 'SETTLED'
      AND NOT EXISTS (
        SELECT 1 FROM public.ledger_entries le2
        WHERE le2.bet_id = le.bet_id
          AND le2.user_id = le.user_id
          AND le2.type = 'BET_WIN'
      )
  )
  SELECT
    mi.user_id,
    mi.display_name,
    mi.avatar_url,
    mi.role,
    mi.joined_at,
    mi.left_at,
    mi.left_reason,
    mb.balance,
    ri.starting_chips,
    dout.chips_donated,
    dout.donation_count,
    din.chips_received,
    din.received_count,
    s.settlement_status,
    bw.wins,
    bl.losses,
    w.total_wagered,
    ws.biggest_win_net,
    ls.biggest_loss_net
  FROM member_info mi
  CROSS JOIN room_info ri
  CROSS JOIN member_balance mb
  CROSS JOIN donations_out dout
  CROSS JOIN donations_in din
  LEFT JOIN settlement s ON true
  CROSS JOIN bet_wins bw
  CROSS JOIN bet_losses bl
  CROSS JOIN wagering w
  CROSS JOIN win_stats ws
  CROSS JOIN loss_stats ls;
$$;

REVOKE ALL ON FUNCTION public.get_member_stats(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_stats(uuid, uuid) TO authenticated;
