-- Notifications table for in-app notification history and badges:
--   * notifications table stores all notification history per user
--   * Notification types: bet_matched, bet_settled, bet_disputed, bet_expiring,
--     chip_request_created, chip_donated
--   * RPCs: mark_notifications_read(ids[]), get_unread_notification_count()
--   * RLS: users can only see their own notifications

-- ============================================================
-- 1. notifications table
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in (
    'bet_matched',
    'bet_settled',
    'bet_disputed',
    'bet_expiring',
    'chip_request_created',
    'chip_donated'
  )),
  title text not null,
  body text not null,
  data jsonb default '{}',
  read_at timestamp,
  created_at timestamp default now()
);

-- Indexes for efficient unread count and feed queries
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Users can view their own notifications
create policy "Users can view own notifications"
on public.notifications for select
using (auth.uid() = user_id);

-- Users can update (mark read) their own notifications
create policy "Users can update own notifications"
on public.notifications for update
using (auth.uid() = user_id);

-- ============================================================
-- 2. mark_notifications_read RPC
-- ============================================================

create or replace function public.mark_notifications_read(p_notification_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0721';
  end if;

  if p_notification_ids is null or array_length(p_notification_ids, 1) is null then
    return 0;
  end if;

  update public.notifications
  set read_at = now()
  where id = any(p_notification_ids)
    and user_id = auth.uid()
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ============================================================
-- 3. get_unread_notification_count RPC
-- ============================================================

create or replace function public.get_unread_notification_count()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.notifications
  where user_id = auth.uid()
    and read_at is null;
$$;

revoke all on function public.get_unread_notification_count() from public;
grant execute on function public.get_unread_notification_count() to authenticated;

-- ============================================================
-- 4. get_notifications RPC (paginated feed)
-- ============================================================

create or replace function public.get_notifications(
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  type text,
  title text,
  body text,
  data jsonb,
  read_at timestamp,
  created_at timestamp
)
language sql
security definer
set search_path = public
stable
as $$
  select
    n.id,
    n.type,
    n.title,
    n.body,
    n.data,
    n.read_at,
    n.created_at
  from public.notifications n
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_notifications(int, int) from public;
grant execute on function public.get_notifications(int, int) to authenticated;
