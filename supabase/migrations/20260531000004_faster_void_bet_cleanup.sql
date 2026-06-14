-- Faster void bet cleanup: 1 minute instead of 5 minutes
-- ============================================================
--
-- Changes:
-- 1. Update cleanup function to delete void bets older than 1 minute
-- 2. Run cron every 1 minute instead of every 5 minutes
--
-- Result: Void bets deleted in 1-2 minutes (vs 5-10 minutes before)

-- ============================================================
-- 1. Update cleanup function - delete after 1 minute
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
  -- Delete void bets older than 1 minute
  DELETE FROM public.bets
  WHERE status = 'VOID'
    AND updated_at < now() - interval '1 minute';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 2. Reschedule cron to run every 1 minute
-- ============================================================

-- Remove old schedule
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'cleanup-stale-void-bets';
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN OTHERS THEN NULL;
END;
$$;

-- Schedule every 1 minute
SELECT cron.schedule(
  'cleanup-stale-void-bets',
  '* * * * *',  -- Every minute
  $$ SELECT public.cleanup_stale_void_bets(); $$
);
