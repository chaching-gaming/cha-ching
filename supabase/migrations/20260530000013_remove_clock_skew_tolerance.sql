-- Remove 10-second clock skew tolerance from process_expired_bet
--
-- This tolerance was added before we had proper server time sync on the client.
-- Now that the client uses NTP-style time sync (TimeProvider), the tolerance
-- causes bets to process 10 seconds early.
--
-- The client now correctly uses server-synced time for all expiry checks,
-- so we can remove the tolerance and process exactly when expires_at <= now().

CREATE OR REPLACE FUNCTION public.process_expired_bet(p_bet_id uuid)
RETURNS public.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
  v_room public.rooms;
  v_picks int;
BEGIN
  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;

  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0601';
  END IF;

  -- Only process OPEN or MATCHED bets
  IF v_bet.status NOT IN ('OPEN', 'MATCHED') THEN
    RETURN v_bet;
  END IF;

  -- Check if expired (no tolerance - client uses server-synced time)
  IF v_bet.expires_at IS NULL OR v_bet.expires_at > now() THEN
    RETURN v_bet;
  END IF;

  -- Count distinct picks staked on this bet
  SELECT count(DISTINCT pick) INTO v_picks
    FROM public.bet_stakes
   WHERE bet_id = v_bet.id;

  IF v_picks >= 2 THEN
    -- Matched bet: transition to PENDING_RESULT with outcome window
    SELECT * INTO v_room FROM public.rooms WHERE id = v_bet.room_id;

    UPDATE public.bets
       SET status = 'PENDING_RESULT',
           outcome_window_ends_at = now() + (COALESCE(v_room.outcome_submission_window_seconds, 30) || ' seconds')::INTERVAL
     WHERE id = p_bet_id
    RETURNING * INTO v_bet;
  ELSE
    -- Unmatched bet (0 or 1 distinct picks): void and refund
    UPDATE public.bets
       SET status = 'VOID'
     WHERE id = p_bet_id;

    -- Insert VOID_REFUND ledger entries for all stakers (restores their chips)
    INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
    SELECT v_bet.room_id, 'VOID_REFUND', v_bet.id, bs.user_id, bs.stake
      FROM public.bet_stakes bs
     WHERE bs.bet_id = v_bet.id;

    -- Re-fetch the updated bet
    SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id;
  END IF;

  RETURN v_bet;
END;
$$;

COMMENT ON FUNCTION public.process_expired_bet IS
  'Process an expired bet: matched bets go to PENDING_RESULT, unmatched bets are voided with refunds.';
