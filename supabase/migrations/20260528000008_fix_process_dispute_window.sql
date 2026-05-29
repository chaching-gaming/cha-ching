-- Fix process_dispute_window to handle NULL dispute_window_ends_at
--
-- For backwards compatibility, treat NULL dispute_window_ends_at as
-- "window already expired" so they can be processed.

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

  -- Check if dispute window has expired
  -- For backwards compatibility: if dispute_window_ends_at is NULL, treat as expired
  IF v_bet.dispute_window_ends_at IS NOT NULL AND v_bet.dispute_window_ends_at > now() THEN
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
