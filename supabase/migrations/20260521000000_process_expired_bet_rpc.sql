-- On-demand expired bet processor: allows clients to trigger immediate
-- VOID/PENDING_RESULT transition without waiting for the cron job.
-- This eliminates the 0-60 second lag when viewing expired bets.

create or replace function public.process_expired_bet(p_bet_id uuid)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_picks int;
begin
  -- No auth required - this is a read-triggered side effect that
  -- simply accelerates what the cron job would do anyway.

  select * into v_bet from public.bets where id = p_bet_id for update;

  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0601';
  end if;

  -- Only process OPEN bets that have actually expired
  if v_bet.status is distinct from 'OPEN' then
    return v_bet; -- Already processed, return current state
  end if;

  if v_bet.expires_at is null or v_bet.expires_at > now() then
    return v_bet; -- Not expired yet, return current state
  end if;

  -- Count distinct picks staked on this bet
  select count(distinct pick) into v_picks
    from public.bet_stakes
   where bet_id = v_bet.id;

  if v_picks >= 2 then
    -- Matched bet: transition to PENDING_RESULT
    update public.bets
       set status = 'PENDING_RESULT'
     where id = p_bet_id
    returning * into v_bet;
  else
    -- Unmatched bet (0 or 1 distinct picks): void and refund
    update public.bets
       set status = 'VOID'
     where id = p_bet_id;

    -- Insert VOID_REFUND ledger entries for all stakers (restores their chips)
    insert into public.ledger_entries (room_id, type, bet_id, user_id, amount)
    select v_bet.room_id, 'VOID_REFUND', v_bet.id, bs.user_id, bs.stake
      from public.bet_stakes bs
     where bs.bet_id = v_bet.id;

    -- Re-fetch the updated bet
    select * into v_bet from public.bets where id = p_bet_id;
  end if;

  return v_bet;
end;
$$;

-- Grant execute to authenticated users (anyone viewing a bet can trigger processing)
grant execute on function public.process_expired_bet(uuid) to authenticated;

comment on function public.process_expired_bet(uuid) is
  'Immediately processes an expired bet, transitioning it to VOID (with refunds) '
  'or PENDING_RESULT depending on whether both sides were staked. '
  'This eliminates the delay from waiting for the cron job.';
