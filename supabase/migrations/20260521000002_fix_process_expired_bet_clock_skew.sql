-- Fix clock skew issue: add 10-second tolerance for client/server time differences.
-- The client may think a bet is expired while the server hasn't reached that time yet.

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
  select * into v_bet from public.bets where id = p_bet_id for update;

  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0601';
  end if;

  -- Only process OPEN bets
  if v_bet.status is distinct from 'OPEN' then
    return v_bet;
  end if;

  -- Check if expired, with 10-second tolerance for clock skew between client and server.
  -- This allows processing bets that expire within the next 10 seconds,
  -- handling cases where client clock is slightly ahead of server clock.
  if v_bet.expires_at is null or v_bet.expires_at > (now() + interval '10 seconds') then
    return v_bet;
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
