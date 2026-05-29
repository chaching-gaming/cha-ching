-- Update submit_outcome RPC for timed window settlement
--
-- Changes:
-- 1. Reject submissions if outcome_window_ends_at has passed
-- 2. Remove auto-call to settle_bet() (settlement now happens via cron)
-- 3. Auto-transition sets outcome_window_ends_at when transitioning

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

  -- Check if outcome submission window has closed
  IF v_bet.outcome_window_ends_at IS NOT NULL AND v_bet.outcome_window_ends_at < now() THEN
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

  -- NOTE: Removed auto-call to settle_bet()
  -- Settlement now happens via cron when outcome_window_ends_at expires

  RETURN v_submission;
END;
$$;
