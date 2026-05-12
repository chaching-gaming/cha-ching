-- Fix settle_bet and resolve_dispute to use correct ledger types
-- These functions were using 'WIN' instead of 'BET_WIN'

-- ============================================================
-- 1. Fix settle_bet function
-- ============================================================

create or replace function public.settle_bet(p_bet_id uuid)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_submissions record;
  v_outcome text;
  v_stakes_total int;
  v_n_winners int;
  v_total_pool int;
  v_per_winner int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0501';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0502';
  end if;

  if v_bet.status is distinct from 'PENDING_RESULT' then
    raise exception 'Bet is not pending result' using errcode = 'P0503';
  end if;

  if not public.is_room_member(v_bet.room_id) then
    raise exception 'Not a member of this room' using errcode = 'P0504';
  end if;

  -- Check for consensus among outcome_submissions
  select selected_option, count(*)
    into v_submissions
    from public.outcome_submissions
   where bet_id = p_bet_id
   group by selected_option
   order by count(*) desc
   limit 1;

  if v_submissions is null then
    raise exception 'No outcome submissions' using errcode = 'P0505';
  end if;

  -- Check if consensus (all submissions agree)
  if (select count(distinct selected_option) from public.outcome_submissions where bet_id = p_bet_id) = 1 then
    v_outcome := v_submissions.selected_option;

    select count(*) into v_stakes_total from public.bet_stakes where bet_id = p_bet_id;

    select count(*) into v_n_winners
      from public.bet_stakes
     where bet_id = p_bet_id
       and lower(trim(pick)) = lower(trim(v_outcome));

    v_total_pool := v_stakes_total * v_bet.stake;

    if v_n_winners > 0 then
      v_per_winner := v_total_pool / v_n_winners;

      insert into public.ledger_entries (room_id, type, bet_id, user_id, amount)
      select v_bet.room_id, 'BET_WIN', v_bet.id, bs.user_id, v_per_winner
        from public.bet_stakes bs
       where bs.bet_id = p_bet_id
         and lower(trim(bs.pick)) = lower(trim(v_outcome));
    end if;

    update public.bets
       set status = 'SETTLED',
           outcome = v_outcome,
           settlement_method = 'CONSENSUS',
           settled_at = now()
     where id = p_bet_id
    returning * into v_bet;
  else
    update public.bets
       set status = 'DISPUTED'
     where id = p_bet_id
    returning * into v_bet;
  end if;

  return v_bet;
end;
$$;

revoke all on function public.settle_bet(uuid) from public;
grant execute on function public.settle_bet(uuid) to authenticated;

-- ============================================================
-- 2. Fix resolve_dispute function
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
    select v_bet.room_id, 'BET_WIN', v_bet.id, bs.user_id, v_per_winner
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
