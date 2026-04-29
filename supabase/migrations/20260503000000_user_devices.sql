-- User devices for push notifications:
--   * user_devices table stores Expo push tokens per user/device
--   * RPCs: register_device(token, platform), unregister_device(token)
--   * RLS: users can only see/manage their own devices

-- ============================================================
-- 1. user_devices table
-- ============================================================

create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamp default now(),
  unique(user_id, expo_push_token)
);

-- Indexes for efficient lookups
create index user_devices_user_id_idx on public.user_devices (user_id);
create index user_devices_token_idx on public.user_devices (expo_push_token);

alter table public.user_devices enable row level security;

-- Users can view their own devices
create policy "Users can view own devices"
on public.user_devices for select
using (auth.uid() = user_id);

-- Users can insert their own devices (via RPC preferred)
create policy "Users can insert own devices"
on public.user_devices for insert
with check (auth.uid() = user_id);

-- Users can delete their own devices
create policy "Users can delete own devices"
on public.user_devices for delete
using (auth.uid() = user_id);

-- ============================================================
-- 2. register_device RPC
-- ============================================================

create or replace function public.register_device(
  p_expo_push_token text,
  p_platform text
)
returns public.user_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.user_devices;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0701';
  end if;

  if p_expo_push_token is null or trim(p_expo_push_token) = '' then
    raise exception 'Push token is required' using errcode = 'P0702';
  end if;

  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'Platform must be ios or android' using errcode = 'P0703';
  end if;

  -- Upsert: update timestamp if token exists, insert otherwise
  insert into public.user_devices (user_id, expo_push_token, platform, updated_at)
  values (auth.uid(), trim(p_expo_push_token), p_platform, now())
  on conflict (user_id, expo_push_token) do update
    set platform = excluded.platform,
        updated_at = now()
  returning * into v_device;

  return v_device;
end;
$$;

revoke all on function public.register_device(text, text) from public;
grant execute on function public.register_device(text, text) to authenticated;

-- ============================================================
-- 3. unregister_device RPC
-- ============================================================

create or replace function public.unregister_device(p_expo_push_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0711';
  end if;

  if p_expo_push_token is null or trim(p_expo_push_token) = '' then
    raise exception 'Push token is required' using errcode = 'P0712';
  end if;

  delete from public.user_devices
  where user_id = auth.uid()
    and expo_push_token = trim(p_expo_push_token);

  return true;
end;
$$;

revoke all on function public.unregister_device(text) from public;
grant execute on function public.unregister_device(text) to authenticated;
