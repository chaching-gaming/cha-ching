-- Fix void_bet function to use VOID_REFUND instead of REFUND
-- The ledger_entries_type_check constraint only allows:
-- 'BET_WIN', 'BET_LOSS', 'STAKE_LOCK', 'VOID_REFUND', 'DONATION_IN', 'DONATION_OUT', 'GRANT'
-- ============================================================

CREATE OR REPLACE FUNCTION public.void_bet(p_bet_id uuid, p_reason text default null)
RETURNS public.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
  v_prev_status text;
  v_refund_total int := 0;
  v_affected_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0501';
  END IF;

  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0502';
  END IF;

  IF NOT public.is_room_admin(v_bet.room_id) THEN
    RAISE EXCEPTION 'Only an admin can void bets' USING ERRCODE = 'P0503';
  END IF;

  IF v_bet.status = 'VOID' THEN
    RAISE EXCEPTION 'Bet is already voided' USING ERRCODE = 'P0504';
  END IF;

  v_prev_status := v_bet.status;

  -- Insert VOID_REFUND ledger entries (not REFUND - that type doesn't exist anymore)
  WITH reversals AS (
    INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
    SELECT v_bet.room_id, 'VOID_REFUND', v_bet.id, le.user_id, -sum(le.amount)
      FROM public.ledger_entries le
     WHERE le.bet_id = p_bet_id
     GROUP BY le.user_id
    HAVING sum(le.amount) <> 0
    RETURNING user_id, amount
  )
  SELECT coalesce(sum(abs(amount)), 0)::int, count(*)::int
    INTO v_refund_total, v_affected_count
    FROM reversals;

  UPDATE public.bets
     SET status = 'VOID'
   WHERE id = p_bet_id
  RETURNING * INTO v_bet;

  INSERT INTO public.bet_void_logs
    (bet_id, room_id, voided_by, previous_status, reason, refund_total, affected_user_count)
  VALUES
    (v_bet.id, v_bet.room_id, auth.uid(), v_prev_status,
     nullif(trim(p_reason), ''), v_refund_total, v_affected_count);

  -- Schedule deletion after 30 seconds
  PERFORM schedule_void_bet_deletion(v_bet.id);

  RETURN v_bet;
END;
$$;
