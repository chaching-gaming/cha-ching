-- Migration: First Submission Settlement
--
-- Changes the outcome submission flow:
-- - First outcome submission immediately triggers PENDING_DISPUTE with 30s window
-- - Subsequent submissions are blocked (users should use raise_dispute instead)
-- - Removes the "wait for all submissions" logic
--
-- Flow: PENDING_RESULT → [first submission] → PENDING_DISPUTE (30s) → SETTLED

-- ============================================================
-- 1. Update submit_outcome - First submission triggers settlement
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
  v_existing_submission_count int;
  DISPUTE_WINDOW_SECONDS INT := 30;
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
    UPDATE public.bets
       SET status = 'PENDING_RESULT'
     WHERE id = p_bet_id;

    SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id;
  END IF;

  -- Only allow submissions when bet is PENDING_RESULT
  IF v_bet.status IS DISTINCT FROM 'PENDING_RESULT' THEN
    RAISE EXCEPTION 'Bet is not awaiting outcome submissions. Raise a dispute if you disagree with the declared outcome.' USING ERRCODE = 'P0303';
  END IF;

  -- Check if any outcome has already been submitted for this bet
  SELECT count(*) INTO v_existing_submission_count
    FROM public.outcome_submissions
   WHERE bet_id = p_bet_id;

  IF v_existing_submission_count > 0 THEN
    RAISE EXCEPTION 'Outcome already declared. Raise a dispute if you disagree.' USING ERRCODE = 'P0308';
  END IF;

  -- Validate user is a participant
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

  -- Validate selected option is valid for this bet
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

  -- Insert the outcome submission
  INSERT INTO public.outcome_submissions (bet_id, user_id, selected_option)
  VALUES (p_bet_id, auth.uid(), v_option)
  RETURNING * INTO v_submission;

  -- First submission: immediately move to PENDING_DISPUTE with 30s window
  UPDATE public.bets
     SET status = 'PENDING_DISPUTE',
         preliminary_outcome = v_option,
         dispute_window_ends_at = now() + (DISPUTE_WINDOW_SECONDS || ' seconds')::INTERVAL
   WHERE id = p_bet_id;

  RETURN v_submission;
END;
$$;

-- ============================================================
-- 2. Deprecate process_all_submissions (keep for backwards compat)
-- ============================================================
-- This function is no longer called by submit_outcome, but we keep it
-- in case there are any external references. It now just returns the bet
-- without processing.

CREATE OR REPLACE FUNCTION public.process_all_submissions(p_bet_id uuid)
RETURNS public.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
BEGIN
  -- This function is deprecated. First submission now triggers PENDING_DISPUTE directly.
  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id;
  RETURN v_bet;
END;
$$;

-- ============================================================
-- 3. Update notification for PENDING_DISPUTE
-- ============================================================
-- Update the message to: "Bet result declared: [outcome]. 30s to dispute."

CREATE OR REPLACE FUNCTION public.trigger_bet_pending_dispute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stakers uuid[];
  v_dispute_seconds int;
BEGIN
  -- Only fire on transition to PENDING_DISPUTE
  IF old.status = 'PENDING_DISPUTE' OR new.status IS DISTINCT FROM 'PENDING_DISPUTE' THEN
    RETURN new;
  END IF;

  -- Get all participants
  SELECT array_agg(DISTINCT user_id) INTO v_stakers
    FROM public.bet_stakes
   WHERE bet_id = new.id;

  -- Calculate remaining dispute time
  v_dispute_seconds := EXTRACT(EPOCH FROM (new.dispute_window_ends_at - now()))::int;
  IF v_dispute_seconds < 0 THEN
    v_dispute_seconds := 30;
  END IF;

  IF v_stakers IS NOT NULL AND array_length(v_stakers, 1) > 0 THEN
    PERFORM public.notify_users(
      'bet_pending_dispute',
      v_stakers,
      'Bet Result Declared',
      'Result: ' || COALESCE(new.preliminary_outcome, 'TBD') || '. ' || v_dispute_seconds || 's to dispute.',
      jsonb_build_object(
        'room_id', new.room_id,
        'bet_id', new.id,
        'preliminary_outcome', new.preliminary_outcome,
        'dispute_window_seconds', v_dispute_seconds
      )
    );
  END IF;

  RETURN new;
END;
$$;
