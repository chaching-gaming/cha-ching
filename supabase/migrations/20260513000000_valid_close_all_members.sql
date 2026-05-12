-- Valid close: transition bet to PENDING_RESULT when all room members have joined
--
-- When every member of a room has placed a stake on a bet, the bet should
-- automatically transition to allow outcome submission (no need to wait for expiry).
-- This is a "valid close" - not early, since everyone who can join has joined.

-- ============================================================
-- 1. Update join_bet to check for valid close condition
-- ============================================================

create or replace function public.join_bet(p_bet_id uuid, p_pick text)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_room public.rooms;
  v_pick text;
  v_i int;
  v_opt text;
  v_ok boolean := false;
  v_balance numeric;
  v_room_member_count int;
  v_bet_stake_count int;
  v_distinct_picks int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0002';
  end if;

  if v_bet.status is distinct from 'OPEN' then
    raise exception 'Bet is not open' using errcode = 'P0003';
  end if;

  if v_bet.expires_at is not null and v_bet.expires_at <= now() then
    raise exception 'Bet has expired' using errcode = 'P0005';
  end if;

  v_pick := trim(p_pick);
  if v_pick = '' then
    raise exception 'Pick is required' using errcode = 'P0006';
  end if;

  if jsonb_typeof(v_bet.options) is distinct from 'array' then
    raise exception 'Invalid bet options' using errcode = 'P0007';
  end if;

  for v_i in 0..(jsonb_array_length(v_bet.options) - 1) loop
    if jsonb_typeof(v_bet.options -> v_i) is distinct from 'string' then
      raise exception 'Each option must be a string' using errcode = 'P0008';
    end if;
    v_opt := trim(v_bet.options ->> v_i);
    if lower(v_opt) = lower(v_pick) then
      v_pick := v_opt;
      v_ok := true;
      exit;
    end if;
  end loop;

  if not v_ok then
    raise exception 'Pick is not a valid option' using errcode = 'P0009';
  end if;

  -- Subject rule: the player the bet is about can only back the allowed side.
  if v_bet.subject_user_id is not null
     and v_bet.subject_user_id = auth.uid()
     and v_bet.subject_positive_option is not null
     and lower(trim(v_bet.subject_positive_option)) <> lower(v_pick) then
    raise exception 'You can''t bet against yourself on this question' using errcode = 'P0022';
  end if;

  select * into v_room from public.rooms where id = v_bet.room_id;
  if v_room is null then
    raise exception 'Room not found' using errcode = 'P0010';
  end if;
  if not v_room.is_active then
    raise exception 'Session is not active' using errcode = 'P0011';
  end if;

  if not public.is_room_member(v_bet.room_id) then
    raise exception 'Not a member of this room' using errcode = 'P0012';
  end if;

  -- Zero floor check: balance after stake must be >= 0
  select coalesce(sum(amount), 0) into v_balance
    from public.ledger_entries
   where room_id = v_bet.room_id and user_id = auth.uid();

  if (v_balance - v_bet.stake) < 0 then
    raise exception 'You don''t have enough chips' using errcode = 'P0015';
  end if;

  -- Unique(bet_id, user_id) catches duplicates with a constraint-violation;
  -- we surface a friendlier message first.
  if exists (
    select 1 from public.bet_stakes
    where bet_id = p_bet_id and user_id = auth.uid()
  ) then
    raise exception 'You already joined this bet' using errcode = 'P0023';
  end if;

  insert into public.bet_stakes (bet_id, user_id, pick, stake)
  values (p_bet_id, auth.uid(), v_pick, v_bet.stake);

  insert into public.ledger_entries (room_id, type, bet_id, user_id, amount)
  values (v_bet.room_id, 'STAKE_LOCK', v_bet.id, auth.uid(), -v_bet.stake);

  -- ============================================================
  -- Valid close check: if all room members have staked on this bet
  -- AND at least 2 distinct picks exist, transition to PENDING_RESULT
  -- ============================================================

  -- Count total room members
  select count(*) into v_room_member_count
    from public.room_members
   where room_id = v_bet.room_id;

  -- Count stakes on this bet (including the one we just inserted)
  select count(*) into v_bet_stake_count
    from public.bet_stakes
   where bet_id = p_bet_id;

  -- Check if all room members have joined
  if v_bet_stake_count >= v_room_member_count then
    -- Count distinct picks to ensure the bet is properly matched (at least 2 sides)
    select count(distinct pick) into v_distinct_picks
      from public.bet_stakes
     where bet_id = p_bet_id;

    if v_distinct_picks >= 2 then
      -- Valid close: all members have staked and both sides have backers
      update public.bets
         set status = 'PENDING_RESULT'
       where id = p_bet_id
      returning * into v_bet;
    end if;
  end if;

  return v_bet;
end;
$$;

revoke all on function public.join_bet(uuid, text) from public;
grant execute on function public.join_bet(uuid, text) to authenticated;
