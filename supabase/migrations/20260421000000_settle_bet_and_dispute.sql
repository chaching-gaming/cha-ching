-- Bet settlement flow:
--   * settle_bet(p_bet_id) — idempotent consensus check; auto-called at end of submit_outcome
--   * resolve_dispute(p_bet_id, p_final_option) — attestor-only override for DISPUTED bets
--   * Ledger type constraint now allows 'WIN'
--
-- Payout model: one WIN ledger entry of +2*stake for the winner.
-- Loser's -stake BET entry (written in accept_bet) already books their loss.

-- ============================================================
-- 1. Expand ledger_entries.type
-- ============================================================

alter table public.ledger_entries drop constraint ledger_entries_type_check;
alter table public.ledger_entries
  add constraint ledger_entries_type_check check (type in ('BET', 'DONATION', 'WIN'));

-- ============================================================
-- 2. Attestor helper (ADMIN is implicitly an attestor)
-- ============================================================

create or replace function public.is_room_attestor(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id
      and user_id = auth.uid()
      and role in ('ATTESTOR', 'ADMIN')
  );
$$;

-- ============================================================
-- 3. settle_bet — idempotent consensus check
-- ============================================================

create or replace function public.settle_bet(p_bet_id uuid)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_sub_offerer public.outcome_submissions;
  v_sub_acceptor public.outcome_submissions;
  v_winner uuid;
  v_outcome text;
begin
  select * into v_bet from public.bets where id = p_bet_id for update;
  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0402';
  end if;

  -- Idempotent: anything already finalized is a no-op.
  if v_bet.status in ('SETTLED', 'DISPUTED', 'VOID', 'EXPIRED') then
    return v_bet;
  end if;

  if v_bet.status is distinct from 'MATCHED'
     and v_bet.status is distinct from 'PENDING_RESULT' then
    return v_bet;
  end if;

  select * into v_sub_offerer from public.outcome_submissions
    where bet_id = p_bet_id and user_id = v_bet.offered_by;
  select * into v_sub_acceptor from public.outcome_submissions
    where bet_id = p_bet_id and user_id = v_bet.accepted_by;

  -- Both participants must have submitted before we can consensus-settle.
  if v_sub_offerer is null or v_sub_acceptor is null then
    return v_bet;
  end if;

  if lower(trim(v_sub_offerer.selected_option)) = lower(trim(v_sub_acceptor.selected_option)) then
    v_outcome := v_sub_offerer.selected_option;
    if lower(trim(v_bet.offered_pick)) = lower(trim(v_outcome)) then
      v_winner := v_bet.offered_by;
    else
      v_winner := v_bet.accepted_by;
    end if;

    update public.bets
       set status = 'SETTLED',
           outcome = v_outcome,
           winner = v_winner,
           settlement_method = 'CONSENSUS',
           settled_at = now()
     where id = p_bet_id
    returning * into v_bet;

    insert into public.ledger_entries (room_id, type, bet_id, user_id, amount)
    values (v_bet.room_id, 'WIN', v_bet.id, v_winner, 2 * v_bet.stake);
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
-- 4. Hook settlement into submit_outcome
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

  if v_bet.status not in ('MATCHED', 'PENDING_RESULT') then
    raise exception 'Bet is not awaiting outcome submissions' using errcode = 'P0303';
  end if;

  if auth.uid() is distinct from v_bet.offered_by
     and auth.uid() is distinct from v_bet.accepted_by then
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

  if v_bet.status = 'MATCHED' then
    update public.bets set status = 'PENDING_RESULT' where id = p_bet_id;
  end if;

  -- Consensus auto-settlement (no-op unless both participants have now submitted).
  perform public.settle_bet(p_bet_id);

  return v_submission;
end;
$$;

-- ============================================================
-- 5. resolve_dispute — attestor-only override
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
  v_winner uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0401';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0402';
  end if;

  if v_bet.status is distinct from 'DISPUTED' then
    raise exception 'Only disputed bets can be resolved' using errcode = 'P0403';
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

  if lower(trim(v_bet.offered_pick)) = lower(trim(v_option)) then
    v_winner := v_bet.offered_by;
  else
    v_winner := v_bet.accepted_by;
  end if;

  update public.bets
     set status = 'SETTLED',
         outcome = v_option,
         winner = v_winner,
         settlement_method = 'ATTESTOR',
         settled_at = now()
   where id = p_bet_id
  returning * into v_bet;

  insert into public.ledger_entries (room_id, type, bet_id, user_id, amount)
  values (v_bet.room_id, 'WIN', v_bet.id, v_winner, 2 * v_bet.stake);

  return v_bet;
end;
$$;

revoke all on function public.resolve_dispute(uuid, text) from public;
grant execute on function public.resolve_dispute(uuid, text) to authenticated;
