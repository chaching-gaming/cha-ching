-- Restrict outcome submissions to only PENDING_RESULT bets (after expiry).
-- Also extend resolve_dispute to handle PENDING_RESULT bets so attestors/admins
-- can settle stuck bets where participants haven't submitted outcomes.
--
-- This reverses the "early submission" behavior from 20260423000000.

-- ============================================================
-- 1. submit_outcome — ONLY allow PENDING_RESULT status
-- ============================================================

create or replace function public.submit_outcome(p_bet_id uuid, p_selected_option text)
returns public.outcome_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_option text;
  v_i int;
  v_opt text;
  v_ok boolean := false;
  v_submission public.outcome_submissions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0301';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0302';
  end if;

  -- Only allow submissions when bet is PENDING_RESULT (after expiry)
  if v_bet.status is distinct from 'PENDING_RESULT' then
    raise exception 'Bet is not awaiting outcome submissions' using errcode = 'P0303';
  end if;

  if not exists (
    select 1 from public.bet_stakes
    where bet_id = p_bet_id and user_id = auth.uid()
  ) then
    raise exception 'Only bet participants can submit an outcome' using errcode = 'P0304';
  end if;

  v_option := trim(p_selected_option);
  if v_option = '' then
    raise exception 'Selected option is required' using errcode = 'P0305';
  end if;

  if jsonb_typeof(v_bet.options) is distinct from 'array' then
    raise exception 'Invalid bet options' using errcode = 'P0306';
  end if;

  for v_i in 0..(jsonb_array_length(v_bet.options) - 1) loop
    if jsonb_typeof(v_bet.options -> v_i) = 'string' then
      v_opt := trim(v_bet.options ->> v_i);
      if lower(v_opt) = lower(v_option) then
        v_option := v_opt;
        v_ok := true;
        exit;
      end if;
    end if;
  end loop;

  if not v_ok then
    raise exception 'Selected option is not valid for this bet' using errcode = 'P0306';
  end if;

  if exists (
    select 1 from public.outcome_submissions
    where bet_id = p_bet_id and user_id = auth.uid()
  ) then
    raise exception 'You have already submitted an outcome for this bet' using errcode = 'P0307';
  end if;

  insert into public.outcome_submissions (bet_id, user_id, selected_option)
  values (p_bet_id, auth.uid(), v_option)
  returning * into v_submission;

  perform public.settle_bet(p_bet_id);

  return v_submission;
end;
$$;

-- ============================================================
-- 2. resolve_dispute — also accept PENDING_RESULT status
-- ============================================================

create or replace function public.resolve_dispute(p_bet_id uuid, p_final_option text)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_option text;
  v_i int;
  v_opt text;
  v_ok boolean := false;
  v_stakes_total int;
  v_n_winners int;
  v_total_pool int;
  v_per_winner int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0401';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0402';
  end if;

  -- Allow resolution for both DISPUTED and PENDING_RESULT bets
  if v_bet.status not in ('DISPUTED', 'PENDING_RESULT') then
    raise exception 'Only disputed or pending bets can be resolved' using errcode = 'P0403';
  end if;

  if not public.is_room_attestor(v_bet.room_id) then
    raise exception 'Only attestors can resolve disputes' using errcode = 'P0404';
  end if;

  v_option := trim(p_final_option);
  if v_option = '' then
    raise exception 'Final option is required' using errcode = 'P0405';
  end if;

  if jsonb_typeof(v_bet.options) is distinct from 'array' then
    raise exception 'Invalid bet options' using errcode = 'P0406';
  end if;

  for v_i in 0..(jsonb_array_length(v_bet.options) - 1) loop
    if jsonb_typeof(v_bet.options -> v_i) = 'string' then
      v_opt := trim(v_bet.options ->> v_i);
      if lower(v_opt) = lower(v_option) then
        v_option := v_opt;
        v_ok := true;
        exit;
      end if;
    end if;
  end loop;

  if not v_ok then
    raise exception 'Final option is not a valid option' using errcode = 'P0406';
  end if;

  select count(*) into v_stakes_total from public.bet_stakes where bet_id = p_bet_id;
  select count(*) into v_n_winners
    from public.bet_stakes
   where bet_id = p_bet_id
     and lower(trim(pick)) = lower(trim(v_option));

  v_total_pool := v_stakes_total * v_bet.stake;

  if v_n_winners > 0 then
    v_per_winner := v_total_pool / v_n_winners;

    insert into public.ledger_entries (room_id, type, bet_id, user_id, amount)
    select v_bet.room_id, 'WIN', v_bet.id, bs.user_id, v_per_winner
      from public.bet_stakes bs
     where bs.bet_id = p_bet_id
       and lower(trim(bs.pick)) = lower(trim(v_option));
  end if;

  update public.bets
     set status = 'SETTLED',
         outcome = v_option,
         settlement_method = 'ATTESTOR',
         settled_at = now()
   where id = p_bet_id
  returning * into v_bet;

  return v_bet;
end;
$$;

revoke all on function public.resolve_dispute(uuid, text) from public;
grant execute on function public.resolve_dispute(uuid, text) to authenticated;
