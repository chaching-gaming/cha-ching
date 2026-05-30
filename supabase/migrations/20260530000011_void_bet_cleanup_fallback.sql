-- Fallback cron job for void bet cleanup
--
-- The primary deletion method uses Edge Functions (schedule_void_bet_deletion),
-- but this can fail silently due to:
-- 1. Edge Function URL/Key not configured
-- 2. Edge Function timeout or network issues
-- 3. HTTP call failures
--
-- This cron job runs every 5 minutes as a safety net to clean up any
-- void bets that are older than 5 minutes (well past the 30-second target).

-- ============================================================
-- 1. Cleanup function
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_void_bets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Delete void bets older than 5 minutes
  -- Uses updated_at since that's when status changed to VOID
  DELETE FROM public.bets
  WHERE status = 'VOID'
    AND updated_at < now() - interval '5 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Only postgres role (pg_cron) should invoke this
REVOKE ALL ON FUNCTION public.cleanup_stale_void_bets() FROM public;

-- ============================================================
-- 2. Schedule cron job every 5 minutes
-- ============================================================

-- Unschedule any prior job with the same name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'cleanup-stale-void-bets';
EXCEPTION
  WHEN undefined_table THEN NULL;  -- pg_cron not installed
  WHEN OTHERS THEN NULL;
END;
$$;

-- Schedule the cleanup job
SELECT cron.schedule(
  'cleanup-stale-void-bets',
  '*/5 * * * *',  -- Every 5 minutes
  $$ SELECT public.cleanup_stale_void_bets(); $$
);
