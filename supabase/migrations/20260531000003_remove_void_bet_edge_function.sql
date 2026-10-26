-- Remove Edge Function approach for void bet deletion
-- ============================================================
--
-- Simplify to just use the cron job (cleanup_stale_void_bets).
-- The Edge Function approach was unreliable due to pg_net timeouts.
--
-- Changes:
-- 1. Drop schedule_void_bet_deletion() function
-- 2. Update void_bet() to remove the schedule call
-- 3. Update process_expired_bet() to remove the schedule call
-- 4. Update process_outcome_window() to remove the schedule call

-- ============================================================
-- 1. Drop the Edge Function scheduler (no longer needed)
-- ============================================================

DROP FUNCTION IF EXISTS public.schedule_void_bet_deletion(uuid);

-- ============================================================
-- 2. Update void_bet() - remove schedule_void_bet_deletion call
-- ============================================================

CREATE OR REPLACE FUNCTION public.void_bet(p_bet_id uuid, p_reason text default null)
RETURNS public.bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet public.bets;
  v_prev_status text;
  v_refund_total int := 0;
  v_affected_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0501';
  END IF;

  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;
  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0502';
  END IF;

  IF NOT public.is_room_admin(v_bet.room_id) THEN
    RAISE EXCEPTION 'Only an admin can void bets' USING ERRCODE = 'P0503';
  END IF;

  IF v_bet.status = 'VOID' THEN
    RAISE EXCEPTION 'Bet is already voided' USING ERRCODE = 'P0504';
  END IF;

  v_prev_status := v_bet.status;

  -- Insert VOID_REFUND ledger entries
  WITH reversals AS (
    INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
    SELECT v_bet.room_id, 'VOID_REFUND', v_bet.id, le.user_id, -sum(le.amount)
      FROM public.ledger_entries le
     WHERE le.bet_id = p_bet_id
     GROUP BY le.user_id
    HAVING sum(le.amount) <> 0
    RETURNING user_id, amount
  )
  SELECT coalesce(sum(abs(amount)), 0)::int, count(*)::int
    INTO v_refund_total, v_affected_count
    FROM reversals;

  UPDATE public.bets
     SET status = 'VOID'
   WHERE id = p_bet_id
  RETURNING * INTO v_bet;

  INSERT INTO public.bet_void_logs
    (bet_id, room_id, voided_by, previous_status, reason, refund_total, affected_user_count)
  VALUES
    (v_bet.id, v_bet.room_id, auth.uid(), v_prev_status,
     nullif(trim(p_reason), ''), v_refund_total, v_affected_count);

  -- Deletion handled by cleanup_stale_void_bets cron (every 5 minutes)

  RETURN v_bet;
END;
$$;

-- ============================================================
-- 3. Update process_expired_bet() - remove schedule_void_bet_deletion call
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
  v_window_end timestamptz;
BEGIN
  SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id FOR UPDATE;

  IF v_bet IS NULL THEN
    RAISE EXCEPTION 'Bet not found' USING ERRCODE = 'P0601';
  END IF;

  IF v_bet.status NOT IN ('OPEN', 'MATCHED') THEN
    RETURN v_bet;
  END IF;

  IF v_bet.expires_at IS NULL OR v_bet.expires_at > (now() + interval '10 seconds') THEN
    RETURN v_bet;
  END IF;

  PERFORM 1 FROM public.bet_stakes WHERE bet_id = v_bet.id FOR UPDATE;

  SELECT count(DISTINCT lower(trim(pick))) INTO v_picks
    FROM public.bet_stakes
   WHERE bet_id = v_bet.id;

  IF v_picks >= 2 THEN
    SELECT * INTO v_room FROM public.rooms WHERE id = v_bet.room_id;

    v_window_end := v_bet.expires_at + (COALESCE(v_room.outcome_submission_window_seconds, 30) || ' seconds')::INTERVAL;

    IF v_window_end <= now() THEN
      v_window_end := now() + (COALESCE(v_room.outcome_submission_window_seconds, 30) || ' seconds')::INTERVAL;
    END IF;

    UPDATE public.bets
       SET status = 'PENDING_RESULT',
           outcome_window_ends_at = v_window_end
     WHERE id = p_bet_id
    RETURNING * INTO v_bet;
  ELSE
    UPDATE public.bets
       SET status = 'VOID'
     WHERE id = p_bet_id;

    INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
    SELECT v_bet.room_id, 'VOID_REFUND', v_bet.id, bs.user_id, bs.stake
      FROM public.bet_stakes bs
     WHERE bs.bet_id = v_bet.id;

    SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id;

    -- Deletion handled by cleanup_stale_void_bets cron (every 5 minutes)
  END IF;

  RETURN v_bet;
END;
$$;

-- ============================================================
-- 4. Update process_outcome_window() - remove schedule_void_bet_deletion call
-- ============================================================

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

  IF v_bet.status IS DISTINCT FROM 'PENDING_RESULT' THEN
    RETURN v_bet;
  END IF;

  IF v_bet.outcome_window_ends_at IS NULL THEN
    RAISE NOTICE 'Bet % has NULL outcome_window_ends_at, skipping', p_bet_id;
    RETURN v_bet;
  END IF;

  IF v_bet.outcome_window_ends_at > now() THEN
    RETURN v_bet;
  END IF;

  SELECT count(*) INTO v_total_submissions
    FROM public.outcome_submissions
   WHERE bet_id = p_bet_id;

  -- Case 1: Zero submissions → VOID and refund
  IF v_total_submissions = 0 THEN
    UPDATE public.bets
       SET status = 'VOID'
     WHERE id = p_bet_id;

    INSERT INTO public.ledger_entries (room_id, type, bet_id, user_id, amount)
    SELECT v_bet.room_id, 'VOID_REFUND', v_bet.id, bs.user_id, bs.stake
      FROM public.bet_stakes bs
     WHERE bs.bet_id = v_bet.id;

    SELECT * INTO v_bet FROM public.bets WHERE id = p_bet_id;

    -- Deletion handled by cleanup_stale_void_bets cron (every 5 minutes)

    RETURN v_bet;
  END IF;

  SELECT lower(trim(selected_option)) as normalized_option, count(*) as vote_count
    INTO v_submissions
    FROM public.outcome_submissions
   WHERE bet_id = p_bet_id
   GROUP BY lower(trim(selected_option))
   ORDER BY count(*) DESC
   LIMIT 1;

  v_top_option := v_submissions.normalized_option;
  v_max_votes := v_submissions.vote_count;

  SELECT count(*) INTO v_tie_count
    FROM (
      SELECT lower(trim(selected_option)) as normalized_option, count(*) as vote_count
        FROM public.outcome_submissions
       WHERE bet_id = p_bet_id
       GROUP BY lower(trim(selected_option))
       HAVING count(*) = v_max_votes
    ) tied_options;

  IF v_tie_count > 1 THEN
    UPDATE public.bets
       SET status = 'DISPUTED'
     WHERE id = p_bet_id
    RETURNING * INTO v_bet;

    RETURN v_bet;
  END IF;

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
