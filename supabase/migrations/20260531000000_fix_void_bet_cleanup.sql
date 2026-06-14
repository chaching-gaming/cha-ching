-- Fix void bet cleanup: add updated_at column and fix pg_net timeout
-- ============================================================
--
-- Issues fixed:
-- 1. cleanup_stale_void_bets() referenced non-existent updated_at column
-- 2. schedule_void_bet_deletion() used pg_net default timeout (2s) but Edge Function waits 30s
--
-- Solution:
-- 1. Add updated_at column to bets table with auto-update trigger
-- 2. Fix cleanup function to use the new column
-- 3. Fix pg_net timeout to 35 seconds

-- ============================================================
-- 1. Add updated_at column to bets table
-- ============================================================

ALTER TABLE public.bets
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill existing rows: set updated_at = created_at
UPDATE public.bets
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE public.bets
ALTER COLUMN updated_at SET NOT NULL;

-- ============================================================
-- 2. Create trigger to auto-update updated_at on any change
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bets_set_updated_at ON public.bets;

CREATE TRIGGER bets_set_updated_at
  BEFORE UPDATE ON public.bets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. Fix cleanup_stale_void_bets (now updated_at exists)
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

-- ============================================================
-- 4. Fix schedule_void_bet_deletion with proper pg_net timeout
-- ============================================================

CREATE OR REPLACE FUNCTION public.schedule_void_bet_deletion(p_bet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- Get edge function URL from config table (same as notifications)
  SELECT edge_function_url INTO v_url
  FROM public.notification_config
  WHERE id = 1;

  -- Get service role key from vault (same as notifications)
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  -- Skip if not configured (local dev or missing config)
  IF v_url IS NULL OR v_url = '' OR v_key IS NULL OR v_key = '' THEN
    RAISE NOTICE 'schedule_void_bet_deletion: skipping - config not set (url: %, key: %)',
      CASE WHEN v_url IS NULL OR v_url = '' THEN 'missing' ELSE 'ok' END,
      CASE WHEN v_key IS NULL OR v_key = '' THEN 'missing' ELSE 'ok' END;
    RETURN;
  END IF;

  -- Fire and forget HTTP POST to Edge Function using pg_net
  -- IMPORTANT: timeout must be > 30 seconds since Edge Function waits 30s before deleting
  PERFORM net.http_post(
    url := v_url || '/delete-void-bet',
    body := jsonb_build_object('bet_id', p_bet_id, 'delay_seconds', 30),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 35000  -- 35 seconds (30s wait + 5s buffer)
  );
END;
$$;

-- ============================================================
-- 5. Re-schedule the cron job (in case it failed before)
-- ============================================================

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

SELECT cron.schedule(
  'cleanup-stale-void-bets',
  '*/5 * * * *',
  $$ SELECT public.cleanup_stale_void_bets(); $$
);
