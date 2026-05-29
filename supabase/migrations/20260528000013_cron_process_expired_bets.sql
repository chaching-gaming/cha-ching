-- Add cron job to automatically process expired OPEN/MATCHED bets
--
-- Currently, expired bets only transition to PENDING_RESULT when:
-- 1. Someone opens the bet detail page (client calls process_expired_bet)
-- 2. Someone tries to submit an outcome (submit_outcome auto-transition)
--
-- This adds a cron job to automatically transition expired bets every minute,
-- so the outcome window starts immediately when the bet expires.

-- ============================================================
-- 1. Update settlement_cron_tick to also process expired bets
-- ============================================================

CREATE OR REPLACE FUNCTION public.settlement_cron_tick() RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bet_id uuid;
  v_result public.bets;
BEGIN
  -- STEP 1: Process expired OPEN/MATCHED bets (transition to PENDING_RESULT)
  -- This starts the outcome window immediately when bet expires
  FOR v_bet_id IN
    SELECT id FROM public.bets
    WHERE status IN ('OPEN', 'MATCHED')
      AND expires_at IS NOT NULL
      AND expires_at <= now()
    LIMIT 100
  LOOP
    BEGIN
      SELECT * INTO v_result FROM process_expired_bet(v_bet_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to process expired bet %: %', v_bet_id, SQLERRM;
    END;
  END LOOP;

  -- STEP 2: Process outcome windows (PENDING_RESULT with expired outcome_window_ends_at)
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

  -- STEP 3: Process dispute windows (PENDING_DISPUTE with expired dispute_window_ends_at)
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
