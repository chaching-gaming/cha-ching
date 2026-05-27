-- Auto-delete void bets 30 minutes after voiding
-- Runs every 5 minutes via pg_cron to keep the feed clean
-- while giving users enough time to see the void action.

-- ============================================================
-- 1. Fix ledger_entries FK to cascade on delete
-- ============================================================
-- The original ledger_entries.bet_id FK was created without cascade.
-- Add cascade so deleting a bet removes its ledger entries.

alter table public.ledger_entries
  drop constraint if exists ledger_entries_bet_id_fkey;

alter table public.ledger_entries
  add constraint ledger_entries_bet_id_fkey
  foreign key (bet_id) references public.bets(id) on delete cascade;

-- ============================================================
-- 2. Cleanup function
-- ============================================================

create or replace function public.cleanup_void_bets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Delete bets that were voided more than 30 minutes ago
  -- Uses bet_void_logs.created_at to determine void time
  delete from public.bets
  where status = 'VOID'
    and id in (
      select bet_id
      from public.bet_void_logs
      where created_at < now() - interval '30 minutes'
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Only the postgres role (used by pg_cron) should invoke this.
revoke all on function public.cleanup_void_bets() from public;

-- ============================================================
-- 3. Schedule cleanup job every 5 minutes
-- ============================================================

-- Unschedule any prior job with the same name (idempotent)
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'cleanup-void-bets';
exception
  when undefined_table then
    -- pg_cron not installed in this environment; skip.
    null;
end;
$$;

select cron.schedule(
  'cleanup-void-bets',
  '*/5 * * * *',  -- Every 5 minutes
  $$ select public.cleanup_void_bets(); $$
);

-- ============================================================
-- 4. Run initial cleanup for existing void bets
-- ============================================================

select public.cleanup_void_bets();
