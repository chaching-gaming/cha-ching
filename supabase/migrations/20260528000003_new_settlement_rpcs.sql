-- New Settlement RPCs for Timed Windows and Majority Voting
--
-- RPCs:
-- 1. process_outcome_window(p_bet_id) - Called by cron when outcome window expires
-- 2. raise_dispute(p_bet_id) - User-callable to dispute during PENDING_DISPUTE
-- 3. process_dispute_window(p_bet_id) - Called by cron when dispute window expires

-- ============================================================
-- 1. process_outcome_window - Process expired outcome windows
-- ============================================================
-- Logic:
-- - Only process bets where status = 'PENDING_RESULT' AND outcome_window_ends_at <= now()
-- - Zero submissions → VOID + VOID_REFUND ledger entries
-- - Majority exists → PENDING_DISPUTE + set preliminary_outcome + dispute_window_ends_at
-- - Tie (50/50) → DISPUTED

CREATE OR REPLACE FUNCTION public.process_outcome_window(p_bet_id uuid)
RETURNS public.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
  v_submissions record;
  v_total_submissions int;
  v_max_votes int;
  v_top_option text;
  v_tie_count int;
  DISPUTE_WINDOW_SECONDS INT := 30;
BEGIN
  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;

  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0701';
  END IF;

  -- Only process PENDING_RESULT bets with expired outcome windows
  IF v_bet.status IS DISTINCT FROM 'PENDING_RESULT' THEN
    RETURN v_bet;
  END IF;

  IF v_bet.outcome_window_ends_at IS NULL OR v_bet.outcome_window_ends_at > now() THEN
    RETURN v_bet;
  END IF;

  -- Count total submissions
  SELECT count(*) INTO v_total_submissions
    FROM public.outcome_submissions
   WHERE bet_id = p_bet_id;

  -- Case 1: Zero submissions → VOID and refund
  IF v_total_submissions = 0 THEN
    UPDATE public.bets
       SET status = 'VOID'
     WHERE id = p_bet_id;

    -- Insert VOID_REFUND ledger entries for all stakers
    INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
    SELECT v_bet.room_id, 'VOID_REFUND', v_bet.id, bs.user_id, bs.stake
      FROM public.bet_stakes bs
     WHERE bs.bet_id = v_bet.id;

    SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id;
    RETURN v_bet;
  END IF;

  -- Get the option with the most votes
  SELECT selected_option, count(*) as vote_count
    INTO v_submissions
    FROM public.outcome_submissions
   WHERE bet_id = p_bet_id
   GROUP BY selected_option
   ORDER BY count(*) DESC
   LIMIT 1;

  v_top_option := v_submissions.selected_option;
  v_max_votes := v_submissions.vote_count;

  -- Check for tie (count how many options have the same max votes)
  SELECT count(*) INTO v_tie_count
    FROM (
      SELECT selected_option, count(*) as vote_count
        FROM public.outcome_submissions
       WHERE bet_id = p_bet_id
       GROUP BY selected_option
       HAVING count(*) = v_max_votes
    ) tied_options;

  -- Case 2: Tie → DISPUTED (attestor resolves)
  IF v_tie_count > 1 THEN
    UPDATE public.bets
       SET status = 'DISPUTED'
     WHERE id = p_bet_id
    RETURNING * INTO v_bet;

    RETURN v_bet;
  END IF;

  -- Case 3: Majority exists → PENDING_DISPUTE with dispute window
  UPDATE public.bets
     SET status = 'PENDING_DISPUTE',
         preliminary_outcome = v_top_option,
         dispute_window_ends_at = now() + (DISPUTE_WINDOW_SECONDS || ' seconds')::INTERVAL
   WHERE id = p_bet_id
  RETURNING * INTO v_bet;

  RETURN v_bet;
END;
$$;

REVOKE ALL ON FUNCTION public.process_outcome_window(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.process_outcome_window(uuid) TO authenticated;

-- ============================================================
-- 2. raise_dispute - User-callable to dispute during PENDING_DISPUTE
-- ============================================================
-- Logic:
-- - Must be authenticated
-- - Must be a participant (in bet_stakes)
-- - Bet must be PENDING_DISPUTE
-- - dispute_window_ends_at must be in future
-- - Transition to DISPUTED, set disputed_by

CREATE OR REPLACE FUNCTION public.raise_dispute(p_bet_id uuid)
RETURNS public.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0801';
  END IF;

  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;

  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0802';
  END IF;

  -- Must be PENDING_DISPUTE status
  IF v_bet.status IS DISTINCT FROM 'PENDING_DISPUTE' THEN
    RAISE EXCEPTION 'Bet is not in pending dispute status' USING ERRCODE = 'P0803';
  END IF;

  -- Dispute window must still be open
  IF v_bet.dispute_window_ends_at IS NULL OR v_bet.dispute_window_ends_at <= now() THEN
    RAISE EXCEPTION 'Dispute window has closed' USING ERRCODE = 'P0804';
  END IF;

  -- Must be a participant
  IF NOT EXISTS (
    SELECT 1 FROM public.bet_stakes
    WHERE bet_id = p_bet_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only bet participants can raise a dispute' USING ERRCODE = 'P0805';
  END IF;

  -- Transition to DISPUTED
  UPDATE public.bets
     SET status = 'DISPUTED',
         disputed_by = auth.uid()
   WHERE id = p_bet_id
  RETURNING * INTO v_bet;

  RETURN v_bet;
END;
$$;

REVOKE ALL ON FUNCTION public.raise_dispute(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.raise_dispute(uuid) TO authenticated;

-- ============================================================
-- 3. process_dispute_window - Process expired dispute windows
-- ============================================================
-- Logic:
-- - Only process bets where status = 'PENDING_DISPUTE' AND dispute_window_ends_at <= now()
-- - Calculate winners based on preliminary_outcome
-- - Create BET_WIN ledger entries (pool / winners)
-- - Set status = 'SETTLED', settlement_method = 'MAJORITY_VOTE', outcome = preliminary_outcome

CREATE OR REPLACE FUNCTION public.process_dispute_window(p_bet_id uuid)
RETURNS public.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
  v_n_winners int;
  v_stakes_total int;
  v_total_pool int;
  v_per_winner int;
BEGIN
  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;

  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0901';
  END IF;

  -- Only process PENDING_DISPUTE bets with expired dispute windows
  IF v_bet.status IS DISTINCT FROM 'PENDING_DISPUTE' THEN
    RETURN v_bet;
  END IF;

  IF v_bet.dispute_window_ends_at IS NULL OR v_bet.dispute_window_ends_at > now() THEN
    RETURN v_bet;
  END IF;

  -- preliminary_outcome should be set
  IF v_bet.preliminary_outcome IS NULL THEN
    RAISE EXCEPTION 'Preliminary outcome not set' USING ERRCODE = 'P0902';
  END IF;

  -- Count total stakes and winners
  SELECT count(*) INTO v_stakes_total
    FROM public.bet_stakes
   WHERE bet_id = p_bet_id;

  SELECT count(*) INTO v_n_winners
    FROM public.bet_stakes
   WHERE bet_id = p_bet_id
     AND lower(trim(pick)) = lower(trim(v_bet.preliminary_outcome));

  v_total_pool := v_stakes_total * v_bet.stake;

  IF v_n_winners > 0 THEN
    v_per_winner := v_total_pool / v_n_winners;

    -- Create BET_WIN ledger entries for winners
    INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
    SELECT v_bet.room_id, 'BET_WIN', v_bet.id, bs.user_id, v_per_winner
      FROM public.bet_stakes bs
     WHERE bs.bet_id = p_bet_id
       AND lower(trim(bs.pick)) = lower(trim(v_bet.preliminary_outcome));
  END IF;

  -- Settle the bet
  UPDATE public.bets
     SET status = 'SETTLED',
         outcome = preliminary_outcome,
         settlement_method = 'MAJORITY_VOTE',
         settled_at = now()
   WHERE id = p_bet_id
  RETURNING * INTO v_bet;

  RETURN v_bet;
END;
$$;

REVOKE ALL ON FUNCTION public.process_dispute_window(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.process_dispute_window(uuid) TO authenticated;
