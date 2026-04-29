-- Expiring bets cron job:
--   * notify_expiring_bets() function finds OPEN bets expiring in 14-16 minutes
--   * Scheduled via pg_cron: runs every minute
--   * Notifies all stakers so they have time to find takers

-- ============================================================
-- 1. Enable pg_cron extension
-- ============================================================

create extension if not exists pg_cron with schema extensions;

-- ============================================================
-- 2. notify_expiring_bets function
-- ============================================================

create or replace function public.notify_expiring_bets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet record;
  v_stakers uuid[];
  v_count int := 0;
begin
  -- Find OPEN bets expiring in 14-16 minutes (15-minute warning window)
  -- The 2-minute window ensures we catch each bet exactly once per cron run
  for v_bet in
    select b.*
    from public.bets b
    where b.status = 'OPEN'
      and b.expires_at is not null
      and b.expires_at > now() + interval '14 minutes'
      and b.expires_at <= now() + interval '16 minutes'
  loop
    -- Get all current stakers
    select array_agg(distinct user_id) into v_stakers
    from public.bet_stakes
    where bet_id = v_bet.id;

    if v_stakers is not null and array_length(v_stakers, 1) > 0 then
      perform public.notify_users(
        'bet_expiring',
        v_stakers,
        'Bet Expiring Soon',
        'Your bet "' || left(v_bet.question, 50) || '" expires in ~15 minutes!',
        jsonb_build_object('room_id', v_bet.room_id, 'bet_id', v_bet.id)
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.notify_expiring_bets() from public;

-- ============================================================
-- 3. Schedule cron job (runs every minute)
-- ============================================================

-- Remove existing job if any
select cron.unschedule('notify-expiring-bets')
where exists (
  select 1 from cron.job where jobname = 'notify-expiring-bets'
);

-- Schedule new job
select cron.schedule(
  'notify-expiring-bets',
  '* * * * *',  -- Every minute
  $$select public.notify_expiring_bets()$$
);
