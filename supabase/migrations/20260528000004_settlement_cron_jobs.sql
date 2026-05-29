-- Settlement Cron Jobs
--
-- Runs every minute to process expired settlement windows.
-- Processes both outcome windows (PENDING_RESULT → PENDING_DISPUTE/VOID/DISPUTED)
-- and dispute windows (PENDING_DISPUTE → SETTLED)
--
-- Note: pg_cron runs every minute max. With 30s windows, there's up to 60s delay.
-- Consider client-side immediate calls when countdown hits zero.

-- ============================================================
-- 1. Create the settlement tick function
-- ============================================================

CREATE OR REPLACE FUNCTION public.settlement_cron_tick()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet_id uuid;
BEGIN
  -- Process expired outcome windows (PENDING_RESULT with expired outcome_window_ends_at)
  FOR v_bet_id IN
    SELECT id FROM public.bets
     WHERE status = 'PENDING_RESULT'
       AND outcome_window_ends_at IS NOT NULL
       AND outcome_window_ends_at <= now()
     LIMIT 100
  LOOP
    PERFORM process_outcome_window(v_bet_id);
  END LOOP;

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

-- ============================================================
-- 2. Schedule the cron job (every minute)
-- ============================================================

-- Unschedule if exists (for idempotent migrations)
SELECT cron.unschedule('process-settlement-windows') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-settlement-windows'
);

-- Schedule to run every minute
SELECT cron.schedule(
  'process-settlement-windows',
  '* * * * *',
  'SELECT public.settlement_cron_tick();'
);
