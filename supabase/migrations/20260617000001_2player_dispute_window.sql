-- Migration: Add dispute window for 2-player bets
--
-- Previously, 2-player bets with consensus (both submit same outcome) would
-- settle immediately. This change adds a 30-second dispute window for 2-player
-- bets, giving the losing player a chance to dispute if they believe the
-- outcome was reported incorrectly.
--
-- Changes:
-- - process_all_submissions: 2-player consensus → PENDING_DISPUTE (not SETTLED)

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

  -- Check if all submissions are the same (consensus)
  SELECT count(DISTINCT lower(trim(selected_option))) = 1 INTO v_all_same
    FROM public.outcome_submissions WHERE bet_id = p_bet_id;

  IF v_all_same THEN
    SELECT selected_option INTO v_top_option
      FROM public.outcome_submissions WHERE bet_id = p_bet_id LIMIT 1;

    -- 2-player bets get a dispute window even with consensus
    -- This gives the losing player a chance to dispute before auto-settle
    IF v_participant_count = 2 THEN
      UPDATE public.bets
         SET status = 'PENDING_DISPUTE',
             preliminary_outcome = v_top_option,
             dispute_window_ends_at = now() + (DISPUTE_WINDOW_SECONDS || ' seconds')::INTERVAL
       WHERE id = p_bet_id
      RETURNING * INTO v_bet;

      RETURN v_bet;
    END IF;

    -- 3+ players with unanimous consensus - settle immediately
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
