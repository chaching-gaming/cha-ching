-- Fix void bet deletion to use notification_config and vault
-- instead of app.settings which are not configured
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
  PERFORM net.http_post(
    url := v_url || '/delete-void-bet',
    body := jsonb_build_object('bet_id', p_bet_id, 'delay_seconds', 30),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );
END;
$$;
