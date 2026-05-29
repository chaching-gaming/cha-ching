-- Fix join_bet to use MATCHED status instead of skipping to PENDING_RESULT
--
-- Issue: When all room members join a bet with opposing picks, join_bet was
-- immediately transitioning to PENDING_RESULT, skipping the expiry timer.
--
-- Expected flow:
--   1. Bet created (OPEN)
--   2. Someone joins opposite side → MATCHED
--   3. Expiry timer continues until expires_at
--   4. After expiry → PENDING_RESULT (outcome submission window starts)
--
-- Actual (buggy) flow:
--   1. Bet created (OPEN)
--   2. All members join → PENDING_RESULT immediately (skips expiry timer)
--
-- Fix: Set status to MATCHED when both sides are staked. Do NOT set
-- outcome_window_ends_at - let process_expired_bet handle that after expiry.

CREATE OR REPLACE FUNCTION public.join_bet(p_bet_id uuid, p_pick text)
RETURNS public.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
  v_room public.rooms;
  v_pick text;
  v_i int;
  v_opt text;
  v_ok boolean := false;
  v_balance numeric;
  v_distinct_picks int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_bet.status IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'Bet is not open' USING ERRCODE = 'P0003';
  END IF;

  IF v_bet.expires_at IS NOT NULL AND v_bet.expires_at <= now() THEN
    RAISE EXCEPTION 'Bet has expired' USING ERRCODE = 'P0005';
  END IF;

  v_pick := trim(p_pick);
  IF v_pick = '' THEN
    RAISE EXCEPTION 'Pick is required' USING ERRCODE = 'P0006';
  END IF;

  IF jsonb_typeof(v_bet.options) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid bet options' USING ERRCODE = 'P0007';
  END IF;

  FOR v_i IN 0..(jsonb_array_length(v_bet.options) - 1) LOOP
    IF jsonb_typeof(v_bet.options -> v_i) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Each option must be a string' USING ERRCODE = 'P0008';
    END IF;
    v_opt := trim(v_bet.options ->> v_i);
    IF lower(v_opt) = lower(v_pick) THEN
      v_pick := v_opt;
      v_ok := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Pick is not a valid option' USING ERRCODE = 'P0009';
  END IF;

  -- Subject rule: the player the bet is about can only back the allowed side.
  IF v_bet.subject_user_id IS NOT NULL
     AND v_bet.subject_user_id = auth.uid()
     AND v_bet.subject_positive_option IS NOT NULL
     AND lower(trim(v_bet.subject_positive_option)) <> lower(v_pick) THEN
    RAISE EXCEPTION 'You can''t bet against yourself on this question' USING ERRCODE = 'P0022';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = v_bet.room_id;
  IF v_room IS NULL THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P0010';
  END IF;
  IF NOT v_room.is_active THEN
    RAISE EXCEPTION 'Session is not active' USING ERRCODE = 'P0011';
  END IF;

  IF NOT public.is_room_member(v_bet.room_id) THEN
    RAISE EXCEPTION 'Not a member of this room' USING ERRCODE = 'P0012';
  END IF;

  -- Zero floor check: balance after stake must be >= 0
  SELECT coalesce(sum(amount), 0) INTO v_balance
    FROM public.ledger_entries
   WHERE room_id = v_bet.room_id AND user_id = auth.uid();

  IF (v_balance - v_bet.stake) < 0 THEN
    RAISE EXCEPTION 'You don''t have enough chips' USING ERRCODE = 'P0015';
  END IF;

  -- Unique(bet_id, user_id) catches duplicates with a constraint-violation;
  -- we surface a friendlier message first.
  IF EXISTS (
    SELECT 1 FROM public.bet_stakes
    WHERE bet_id = p_bet_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You already joined this bet' USING ERRCODE = 'P0023';
  END IF;

  INSERT INTO public.bet_stakes (bet_id, user_id, pick, stake)
  VALUES (p_bet_id, auth.uid(), v_pick, v_bet.stake);

  INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
  VALUES (v_bet.room_id, 'STAKE_LOCK', v_bet.id, auth.uid(), -v_bet.stake);

  -- ============================================================
  -- Check if bet is now MATCHED (at least 2 distinct picks)
  -- Do NOT transition to PENDING_RESULT - wait for expires_at
  -- ============================================================

  SELECT count(DISTINCT lower(trim(pick))) INTO v_distinct_picks
    FROM public.bet_stakes
   WHERE bet_id = p_bet_id;

  IF v_distinct_picks >= 2 AND v_bet.status = 'OPEN' THEN
    -- Both sides have backers - mark as MATCHED
    -- The bet will transition to PENDING_RESULT when expires_at passes
    -- (handled by process_expired_bet via cron or client call)
    UPDATE public.bets
       SET status = 'MATCHED'
     WHERE id = p_bet_id
    RETURNING * INTO v_bet;
  ELSE
    -- Refresh bet data to return current state
    SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id;
  END IF;

  RETURN v_bet;
END;
$$;

REVOKE ALL ON FUNCTION public.join_bet(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.join_bet(uuid, text) TO authenticated;
