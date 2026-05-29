-- Fix MATCHED bet processing, NULL outcome_window_ends_at, and early resolution
--
-- Issues fixed:
-- 1. process_expired_bet only handled OPEN bets, not MATCHED
-- 2. submit_outcome allowed submissions when outcome_window_ends_at was NULL,
--    which could leave bets stuck without a processing window
-- 3. When all participants submit, process immediately (don't wait for timeout)

-- ============================================================
-- 1. Fix process_expired_bet to handle both OPEN and MATCHED bets
-- ============================================================

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
  -- Lock the bet row first
  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;

  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0601';
  END IF;

  -- Process OPEN or MATCHED bets (MATCHED = someone joined but bet hasn't been processed yet)
  IF v_bet.status NOT IN ('OPEN', 'MATCHED') THEN
    RETURN v_bet;
  END IF;

  -- Check if expired, with 10-second tolerance for clock skew between client and server.
  IF v_bet.expires_at IS NULL OR v_bet.expires_at > (now() + interval '10 seconds') THEN
    RETURN v_bet;
  END IF;

  -- CRITICAL: Lock all stake rows for this bet to prevent race condition
  -- where a new stake is being inserted while we're counting
  PERFORM 1 FROM public.bet_stakes WHERE bet_id = v_bet.id FOR UPDATE;

  -- Count distinct picks with case normalization for consistency
  SELECT count(DISTINCT lower(trim(pick))) INTO v_picks
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

-- ============================================================
-- 2. Fix submit_outcome: set outcome_window_ends_at if NULL,
--    and process immediately when all participants have submitted
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_outcome(p_bet_id uuid, p_selected_option text)
RETURNS public.outcome_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
  v_room public.rooms;
  v_option text;
  v_i int;
  v_opt text;
  v_ok boolean := false;
  v_submission public.outcome_submissions;
  v_stake_count int;
  v_submission_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0301';
  END IF;

  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0302';
  END IF;

  -- Auto-transition: if bet is expired but still OPEN/MATCHED, move to PENDING_RESULT
  IF v_bet.status IN ('OPEN', 'MATCHED') AND v_bet.expires_at IS NOT NULL AND v_bet.expires_at <= now() THEN
    SELECT * INTO v_room FROM public.rooms WHERE id = v_bet.room_id;

    UPDATE public.bets
       SET status = 'PENDING_RESULT',
           outcome_window_ends_at = now() + (COALESCE(v_room.outcome_submission_window_seconds, 30) || ' seconds')::INTERVAL
     WHERE id = p_bet_id;

    -- Refresh the bet record after update
    SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id;
  END IF;

  -- Only allow submissions when bet is PENDING_RESULT (after expiry)
  IF v_bet.status IS DISTINCT FROM 'PENDING_RESULT' THEN
    RAISE EXCEPTION 'Bet is not awaiting outcome submissions' USING ERRCODE = 'P0303';
  END IF;

  -- SAFEGUARD: If bet is PENDING_RESULT but outcome_window_ends_at is NULL (legacy/race condition),
  -- set it now to prevent the bet from getting stuck
  IF v_bet.outcome_window_ends_at IS NULL THEN
    SELECT * INTO v_room FROM public.rooms WHERE id = v_bet.room_id;

    UPDATE public.bets
       SET outcome_window_ends_at = now() + (COALESCE(v_room.outcome_submission_window_seconds, 30) || ' seconds')::INTERVAL
     WHERE id = p_bet_id;

    -- Refresh the bet record
    SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id;
  END IF;

  -- Check if outcome submission window has closed
  IF v_bet.outcome_window_ends_at < now() THEN
    RAISE EXCEPTION 'Outcome submission window has closed' USING ERRCODE = 'P0308';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bet_stakes
    WHERE bet_id = p_bet_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only bet participants can submit an outcome' USING ERRCODE = 'P0304';
  END IF;

  v_option := trim(p_selected_option);
  IF v_option = '' THEN
    RAISE EXCEPTION 'Selected option is required' USING ERRCODE = 'P0305';
  END IF;

  IF jsonb_typeof(v_bet.options) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid bet options' USING ERRCODE = 'P0306';
  END IF;

  FOR v_i IN 0..(jsonb_array_length(v_bet.options) - 1) LOOP
    IF jsonb_typeof(v_bet.options -> v_i) = 'string' THEN
      v_opt := trim(v_bet.options ->> v_i);
      IF lower(v_opt) = lower(v_option) THEN
        v_option := v_opt;
        v_ok := true;
        EXIT;
      END IF;
    END IF;
  END LOOP;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Selected option is not valid for this bet' USING ERRCODE = 'P0306';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.outcome_submissions
    WHERE bet_id = p_bet_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You have already submitted an outcome for this bet' USING ERRCODE = 'P0307';
  END IF;

  INSERT INTO public.outcome_submissions (bet_id, user_id, selected_option)
  VALUES (p_bet_id, auth.uid(), v_option)
  RETURNING * INTO v_submission;

  -- Check if all participants have now submitted - if so, process immediately
  SELECT count(*) INTO v_stake_count FROM public.bet_stakes WHERE bet_id = p_bet_id;
  SELECT count(*) INTO v_submission_count FROM public.outcome_submissions WHERE bet_id = p_bet_id;

  IF v_submission_count >= v_stake_count THEN
    -- All participants have submitted - process outcome window immediately
    -- Set outcome_window_ends_at to now so it's considered expired
    UPDATE public.bets
       SET outcome_window_ends_at = now()
     WHERE id = p_bet_id;

    -- Trigger immediate processing
    PERFORM process_outcome_window(p_bet_id);
  END IF;

  RETURN v_submission;
END;
$$;

-- ============================================================
-- 3. Fix any stuck PENDING_RESULT bets with NULL outcome_window_ends_at
-- ============================================================

-- Set outcome_window_ends_at to a past time for stuck bets so they get processed
UPDATE public.bets b
   SET outcome_window_ends_at = now() - interval '1 second'
 WHERE b.status = 'PENDING_RESULT'
   AND b.outcome_window_ends_at IS NULL;
