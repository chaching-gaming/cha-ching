-- Migration: Indefinite Outcome Windows
--
-- Changes:
-- 1. process_all_submissions() - New function for when all submit
-- 2. submit_outcome() - Remove window check, add all-submitted trigger
-- 3. resolve_dispute() - Accept PENDING_RESULT status
-- 4. end_session() - Auto-void non-terminal bets
-- 5. Reschedule cron for dispute windows only

-- ============================================================
-- 1. process_all_submissions - New function for when all submit
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_all_submissions(p_bet_id uuid)
RETURNS public.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
  v_participant_count int;
  v_submission_count int;
  v_submissions record;
  v_max_votes int;
  v_top_option text;
  v_tie_count int;
  v_all_same boolean;
  v_winner uuid;
  v_n_winners int;
  v_total_pool int;
  v_per_winner int;
  DISPUTE_WINDOW_SECONDS INT := 30;
BEGIN
  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;

  IF v_bet IS NULL OR v_bet.status != 'PENDING_RESULT' THEN
    RETURN v_bet;
  END IF;

  -- Count participants and submissions
  SELECT count(*) INTO v_participant_count FROM public.bet_stakes WHERE bet_id = p_bet_id;
  SELECT count(*) INTO v_submission_count FROM public.outcome_submissions WHERE bet_id = p_bet_id;

  -- Not all submitted yet
  IF v_submission_count < v_participant_count THEN
    RETURN v_bet;
  END IF;

  -- Check if all submissions are the same (consensus for multi-player)
  SELECT count(DISTINCT lower(trim(selected_option))) = 1 INTO v_all_same
    FROM public.outcome_submissions WHERE bet_id = p_bet_id;

  IF v_all_same THEN
    -- Unanimous consensus - settle immediately
    SELECT selected_option INTO v_top_option
      FROM public.outcome_submissions WHERE bet_id = p_bet_id LIMIT 1;

    -- Count winners (those who picked the outcome)
    SELECT count(*) INTO v_n_winners
      FROM public.bet_stakes
     WHERE bet_id = p_bet_id
       AND lower(trim(pick)) = lower(trim(v_top_option));

    v_total_pool := v_participant_count * v_bet.stake;

    IF v_n_winners > 0 THEN
      v_per_winner := v_total_pool / v_n_winners;

      INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
      SELECT v_bet.room_id, 'BET_WIN', v_bet.id, bs.user_id, v_per_winner
        FROM public.bet_stakes bs
       WHERE bs.bet_id = p_bet_id
         AND lower(trim(bs.pick)) = lower(trim(v_top_option));
    END IF;

    UPDATE public.bets
       SET status = 'SETTLED',
           outcome = v_top_option,
           settlement_method = 'CONSENSUS',
           settled_at = now()
     WHERE id = p_bet_id
    RETURNING * INTO v_bet;

    RETURN v_bet;
  END IF;

  -- Not unanimous - calculate majority
  SELECT selected_option, count(*) as vote_count
    INTO v_submissions
    FROM public.outcome_submissions
   WHERE bet_id = p_bet_id
   GROUP BY selected_option
   ORDER BY count(*) DESC
   LIMIT 1;

  v_top_option := v_submissions.selected_option;
  v_max_votes := v_submissions.vote_count;

  -- Check for tie
  SELECT count(*) INTO v_tie_count
    FROM (
      SELECT selected_option
        FROM public.outcome_submissions
       WHERE bet_id = p_bet_id
       GROUP BY selected_option
       HAVING count(*) = v_max_votes
    ) tied_options;

  IF v_tie_count > 1 THEN
    -- Tie - needs attestor
    UPDATE public.bets SET status = 'DISPUTED' WHERE id = p_bet_id
    RETURNING * INTO v_bet;
  ELSE
    -- Majority exists - start dispute window
    UPDATE public.bets
       SET status = 'PENDING_DISPUTE',
           preliminary_outcome = v_top_option,
           dispute_window_ends_at = now() + (DISPUTE_WINDOW_SECONDS || ' seconds')::INTERVAL
     WHERE id = p_bet_id
    RETURNING * INTO v_bet;
  END IF;

  RETURN v_bet;
END;
$$;

REVOKE ALL ON FUNCTION public.process_all_submissions(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.process_all_submissions(uuid) TO authenticated;

-- ============================================================
-- 2. Update submit_outcome - Remove window check, add trigger
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
    RAISE EXCEPTION 'Bet is not awaiting outcome submissions' USING ERRCODE = 'P0303';
  END IF;

  -- NOTE: Removed outcome_window_ends_at check - windows are now indefinite

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

  -- Check if all participants have now submitted
  PERFORM public.process_all_submissions(p_bet_id);

  RETURN v_submission;
END;
$$;

-- ============================================================
-- 3. Update resolve_dispute - Accept PENDING_RESULT too
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_dispute(p_bet_id uuid, p_final_option text)
RETURNS public.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
  v_option text;
  v_i int;
  v_opt text;
  v_ok boolean := false;
  v_n_winners int;
  v_total_pool int;
  v_per_winner int;
  v_participant_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0401';
  END IF;

  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0402';
  END IF;

  -- Allow DISPUTED or PENDING_RESULT (for admin resolution of stale bets)
  IF v_bet.status NOT IN ('DISPUTED', 'PENDING_RESULT') THEN
    RAISE EXCEPTION 'Only disputed or pending result bets can be resolved' USING ERRCODE = 'P0403';
  END IF;

  IF NOT public.is_room_attestor(v_bet.room_id) THEN
    RAISE EXCEPTION 'Only attestors can resolve disputes' USING ERRCODE = 'P0404';
  END IF;

  v_option := trim(p_final_option);
  IF v_option = '' THEN
    RAISE EXCEPTION 'Final option is required' USING ERRCODE = 'P0405';
  END IF;

  IF jsonb_typeof(v_bet.options) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid bet options' USING ERRCODE = 'P0406';
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
    RAISE EXCEPTION 'Final option is not a valid option' USING ERRCODE = 'P0406';
  END IF;

  -- Count participants and winners for multi-player support
  SELECT count(*) INTO v_participant_count FROM public.bet_stakes WHERE bet_id = p_bet_id;
  SELECT count(*) INTO v_n_winners
    FROM public.bet_stakes
   WHERE bet_id = p_bet_id
     AND lower(trim(pick)) = lower(trim(v_option));

  v_total_pool := v_participant_count * v_bet.stake;

  IF v_n_winners > 0 THEN
    v_per_winner := v_total_pool / v_n_winners;

    INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
    SELECT v_bet.room_id, 'BET_WIN', v_bet.id, bs.user_id, v_per_winner
      FROM public.bet_stakes bs
     WHERE bs.bet_id = p_bet_id
       AND lower(trim(bs.pick)) = lower(trim(v_option));
  END IF;

  UPDATE public.bets
     SET status = 'SETTLED',
         outcome = v_option,
         settlement_method = 'ATTESTOR',
         settled_at = now()
   WHERE id = p_bet_id
  RETURNING * INTO v_bet;

  RETURN v_bet;
END;
$$;

-- ============================================================
-- 4. Update end_session - Auto-void non-terminal bets
-- ============================================================

CREATE OR REPLACE FUNCTION public.end_session(p_room_id uuid)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.rooms;
  v_is_admin boolean;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;

  IF v_room IS NULL THEN
    RAISE EXCEPTION 'Session not found' USING errcode = 'P0001';
  END IF;

  IF NOT v_room.is_active THEN
    RAISE EXCEPTION 'Session is already ended' USING errcode = 'P0004';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND role = 'ADMIN'
      AND left_at IS NULL
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only the admin can end a session' USING errcode = 'P0005';
  END IF;

  -- Auto-void all non-terminal bets and refund stakes
  WITH voided_bets AS (
    UPDATE public.bets
       SET status = 'VOID'
     WHERE room_id = p_room_id
       AND status IN ('OPEN', 'MATCHED', 'PENDING_RESULT', 'PENDING_DISPUTE', 'DISPUTED')
    RETURNING id, room_id, stake
  )
  INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
  SELECT vb.room_id, 'VOID_REFUND', vb.id, bs.user_id, bs.stake
    FROM voided_bets vb
    JOIN public.bet_stakes bs ON bs.bet_id = vb.id;

  -- Mark all active members as left with reason 'ROOM_CLOSED'
  UPDATE public.room_members
  SET left_at = now(), left_reason = 'ROOM_CLOSED'
  WHERE room_id = p_room_id
    AND left_at IS NULL;

  UPDATE public.rooms
  SET is_active = false, ended_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;

-- ============================================================
-- 5. Reschedule cron - Dispute windows only
-- ============================================================

-- Update the settlement_cron_tick function to only process dispute windows
CREATE OR REPLACE FUNCTION public.settlement_cron_tick()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet_id uuid;
BEGIN
  -- NOTE: Outcome window processing removed - outcome windows are now indefinite.
  -- Bets stay in PENDING_RESULT until all participants submit or admin resolves.

  -- Process expired dispute windows (PENDING_DISPUTE with expired dispute_window_ends_at)
  FOR v_bet_id IN
    SELECT id FROM public.bets
     WHERE status = 'PENDING_DISPUTE'
       AND dispute_window_ends_at IS NOT NULL
       AND dispute_window_ends_at <= now()
     LIMIT 100
  LOOP
    PERFORM process_dispute_window(v_bet_id);
  END LOOP;
END;
$$;

-- The cron job 'process-settlement-windows' is already scheduled and will now
-- only process dispute windows since we updated settlement_cron_tick.
