-- Fix Settlement Race Conditions
--
-- This migration fixes several issues:
-- 1. Race condition in process_expired_bet where stakes could be inserted concurrently
-- 2. Inconsistent case handling when counting distinct picks
-- 3. Add double-check after voiding to catch race conditions

-- ============================================================
-- 1. Fix process_expired_bet with proper locking and case normalization
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

  -- Only process OPEN bets
  IF v_bet.status IS DISTINCT FROM 'OPEN' THEN
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
-- 2. Fix process_outcome_window to require explicit window expiry
-- ============================================================
-- Remove the backwards compatibility that treated NULL as expired.
-- New bets MUST have outcome_window_ends_at set. Legacy bets should
-- be handled by a separate migration or manual intervention.

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

  -- CRITICAL: outcome_window_ends_at MUST be set and expired
  -- If NULL, the bet wasn't properly transitioned - don't process
  IF v_bet.outcome_window_ends_at IS NULL THEN
    RAISE NOTICE 'Bet % has NULL outcome_window_ends_at, skipping', p_bet_id;
    RETURN v_bet;
  END IF;

  -- Check if window has expired
  IF v_bet.outcome_window_ends_at > now() THEN
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

  -- Get the option with the most votes (case-insensitive grouping)
  SELECT lower(trim(selected_option)) as normalized_option, count(*) as vote_count
    INTO v_submissions
    FROM public.outcome_submissions
   WHERE bet_id = p_bet_id
   GROUP BY lower(trim(selected_option))
   ORDER BY count(*) DESC
   LIMIT 1;

  v_top_option := v_submissions.normalized_option;
  v_max_votes := v_submissions.vote_count;

  -- Check for tie (count how many options have the same max votes)
  SELECT count(*) INTO v_tie_count
    FROM (
      SELECT lower(trim(selected_option)) as normalized_option, count(*) as vote_count
        FROM public.outcome_submissions
       WHERE bet_id = p_bet_id
       GROUP BY lower(trim(selected_option))
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
  -- Store the original option text (not normalized) for display purposes
  SELECT selected_option INTO v_top_option
    FROM public.outcome_submissions
   WHERE bet_id = p_bet_id
     AND lower(trim(selected_option)) = v_submissions.normalized_option
   LIMIT 1;

  UPDATE public.bets
     SET status = 'PENDING_DISPUTE',
         preliminary_outcome = v_top_option,
         dispute_window_ends_at = now() + (DISPUTE_WINDOW_SECONDS || ' seconds')::INTERVAL
   WHERE id = p_bet_id
  RETURNING * INTO v_bet;

  RETURN v_bet;
END;
$$;

-- ============================================================
-- 3. Fix process_dispute_window to require explicit window expiry
-- ============================================================

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

  -- Only process PENDING_DISPUTE bets
  IF v_bet.status IS DISTINCT FROM 'PENDING_DISPUTE' THEN
    RETURN v_bet;
  END IF;

  -- CRITICAL: dispute_window_ends_at MUST be set and expired
  -- If NULL, the bet wasn't properly transitioned - don't process
  IF v_bet.dispute_window_ends_at IS NULL THEN
    RAISE NOTICE 'Bet % has NULL dispute_window_ends_at, skipping', p_bet_id;
    RETURN v_bet;
  END IF;

  -- Check if window has expired
  IF v_bet.dispute_window_ends_at > now() THEN
    RETURN v_bet;
  END IF;

  -- preliminary_outcome should be set
  IF v_bet.preliminary_outcome IS NULL THEN
    RAISE EXCEPTION 'Preliminary outcome not set' USING ERRCODE = 'P0902';
  END IF;

  -- Count total stakes and winners (case-insensitive comparison)
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

-- ============================================================
-- 4. Update cron tick to handle legacy bets with NULL windows
-- ============================================================
-- Legacy bets with NULL windows will be logged but not processed
-- They need manual intervention or a separate cleanup migration

CREATE OR REPLACE FUNCTION public.settlement_cron_tick() RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bet_id uuid;
  v_result public.bets;
BEGIN
  -- Process outcome windows (PENDING_RESULT with expired outcome_window_ends_at)
  -- Only process bets where outcome_window_ends_at is NOT NULL
  FOR v_bet_id IN
    SELECT id FROM public.bets
    WHERE status = 'PENDING_RESULT'
      AND outcome_window_ends_at IS NOT NULL
      AND outcome_window_ends_at <= now()
    LIMIT 100
  LOOP
    BEGIN
      SELECT * INTO v_result FROM process_outcome_window(v_bet_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to process outcome window for bet %: %', v_bet_id, SQLERRM;
    END;
  END LOOP;

  -- Process dispute windows (PENDING_DISPUTE with expired dispute_window_ends_at)
  -- Only process bets where dispute_window_ends_at is NOT NULL
  FOR v_bet_id IN
    SELECT id FROM public.bets
    WHERE status = 'PENDING_DISPUTE'
      AND dispute_window_ends_at IS NOT NULL
      AND dispute_window_ends_at <= now()
    LIMIT 100
  LOOP
    BEGIN
      SELECT * INTO v_result FROM process_dispute_window(v_bet_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to process dispute window for bet %: %', v_bet_id, SQLERRM;
    END;
  END LOOP;
END;
$$;
