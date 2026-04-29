-- Notification preferences on profiles:
--   * Add notifications_enabled column to profiles (default true)
--   * RPC: update_notification_preference(enabled)
--   * Helper: get_user_notification_settings(user_id) for Edge Functions

-- ============================================================
-- 1. Add notifications_enabled column to profiles
-- ============================================================

alter table public.profiles
  add column if not exists notifications_enabled boolean default true;

-- ============================================================
-- 2. update_notification_preference RPC
-- ============================================================

create or replace function public.update_notification_preference(p_enabled boolean)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0731';
  end if;

  update public.profiles
  set notifications_enabled = coalesce(p_enabled, true)
  where id = auth.uid()
  returning * into v_profile;

  if v_profile is null then
    raise exception 'Profile not found' using errcode = 'P0732';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.update_notification_preference(boolean) from public;
grant execute on function public.update_notification_preference(boolean) to authenticated;

-- ============================================================
-- 3. get_user_notification_settings helper (for Edge Functions)
-- ============================================================
-- Returns notification preference and all device tokens for a user.
-- Used by the send-notification Edge Function to check preferences
-- before sending and to get all device tokens.

create or replace function public.get_user_notification_settings(p_user_id uuid)
returns table (
  notifications_enabled boolean,
  expo_push_tokens text[]
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(p.notifications_enabled, true) as notifications_enabled,
    coalesce(
      array_agg(d.expo_push_token) filter (where d.expo_push_token is not null),
      '{}'::text[]
    ) as expo_push_tokens
  from public.profiles p
  left join public.user_devices d on d.user_id = p.id
  where p.id = p_user_id
  group by p.id, p.notifications_enabled;
$$;

-- This function needs service_role access for Edge Functions
revoke all on function public.get_user_notification_settings(uuid) from public;
grant execute on function public.get_user_notification_settings(uuid) to service_role;
