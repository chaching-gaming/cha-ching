-- Fix process_outcome_window to handle NULL outcome_window_ends_at
--
-- For backwards compatibility with existing bets that were created before
-- the settlement windows feature, treat NULL outcome_window_ends_at as
-- "window already expired" so they can be processed.

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

  -- Only process PENDING_RESULT bets
  IF v_bet.status IS DISTINCT FROM 'PENDING_RESULT' THEN
    RETURN v_bet;
  END IF;

  -- Check if outcome window has expired
  -- For backwards compatibility: if outcome_window_ends_at is NULL, treat as expired
  IF v_bet.outcome_window_ends_at IS NOT NULL AND v_bet.outcome_window_ends_at > now() THEN
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
