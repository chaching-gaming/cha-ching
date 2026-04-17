-- Auto-expire job: flips OPEN bets with expires_at < now() to EXPIRED every minute.

create extension if not exists pg_cron;

create or replace function public.expire_open_bets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.bets
  set status = 'EXPIRED'
  where status = 'OPEN'
    and expires_at is not null
    and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Only the postgres role (used by pg_cron) should invoke this. Revoke from PUBLIC.
revoke all on function public.expire_open_bets() from public;

-- Unschedule any prior job with the same name, then schedule a fresh one.
-- Idempotent so this migration is safe to re-run.
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'expire-open-bets';
exception
  when undefined_table then
    -- pg_cron not installed in this environment; skip.
    null;
end;
$$;

select cron.schedule(
  'expire-open-bets',
  '* * * * *',
  $$ select public.expire_open_bets(); $$
);
