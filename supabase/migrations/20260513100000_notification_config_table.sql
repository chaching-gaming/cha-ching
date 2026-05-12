-- Fix notification configuration for Supabase hosted environments
--
-- Uses Supabase Vault for secure secret storage instead of plain tables.
-- The edge function URL is stored in a config table (not sensitive),
-- while the service role key is stored encrypted in the vault.

-- ============================================================
-- 1. Create notification_config table (URL only, not sensitive)
-- ============================================================

create table if not exists public.notification_config (
  id int primary key default 1 check (id = 1), -- singleton row
  edge_function_url text not null,
  updated_at timestamptz default now()
);

-- Only service role can access
alter table public.notification_config enable row level security;

comment on table public.notification_config is
  'Config table for push notification edge function URL.';

-- ============================================================
-- 2. Update notify_users to read URL from table, key from vault
-- ============================================================

create or replace function public.notify_users(
  p_type text,
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_data jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
  v_payload jsonb;
begin
  -- Skip if no users to notify
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return;
  end if;

  -- Get edge function URL from config table
  select edge_function_url into v_url
  from public.notification_config
  where id = 1;

  -- Get service role key from vault
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  -- Skip if not configured
  if v_url is null or v_key is null then
    raise notice 'notify_users: skipping - config not set (url: %, key: %)',
      case when v_url is null then 'missing' else 'ok' end,
      case when v_key is null then 'missing' else 'ok' end;
    return;
  end if;

  v_payload := jsonb_build_object(
    'type', p_type,
    'user_ids', p_user_ids,
    'title', p_title,
    'body', p_body,
    'data', p_data
  );

  -- Fire and forget HTTP POST to Edge Function using pg_net
  perform net.http_post(
    url := v_url || '/send-notification',
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );
end;
$$;

-- ============================================================
-- 3. Permissions
-- ============================================================

revoke all on function public.notify_users(text, uuid[], text, text, jsonb) from public;
grant execute on function public.notify_users(text, uuid[], text, text, jsonb) to authenticated;
grant execute on function public.notify_users(text, uuid[], text, text, jsonb) to service_role;
