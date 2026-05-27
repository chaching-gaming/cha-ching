-- Notification retention: delete notifications older than 7 days
-- Runs daily via pg_cron to keep the notifications table lean.

-- ============================================================
-- 1. Cleanup function
-- ============================================================

create or replace function public.cleanup_old_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.notifications
  where created_at < now() - interval '7 days';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Only the postgres role (used by pg_cron) should invoke this.
revoke all on function public.cleanup_old_notifications() from public;

-- ============================================================
-- 2. Schedule daily cleanup job at 3:00 AM UTC
-- ============================================================

-- Unschedule any prior job with the same name (idempotent)
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'cleanup-old-notifications';
exception
  when undefined_table then
    -- pg_cron not installed in this environment; skip.
    null;
end;
$$;

select cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * *',  -- Daily at 3:00 AM UTC
  $$ select public.cleanup_old_notifications(); $$
);
