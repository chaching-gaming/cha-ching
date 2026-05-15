-- Auto-transition expired bets to PENDING_RESULT when submitting outcome
-- This fixes the race condition where:
-- 1. Client detects expiry immediately (effectiveStatus)
-- 2. User clicks "Submit Outcome"
-- 3. Backend hasn't transitioned status yet (still OPEN/MATCHED)
-- 4. submit_outcome fails with "Bet is not awaiting outcome submissions"
--
-- Now, submit_outcome will auto-transition if the bet is expired.

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

  -- Auto-transition: if bet is expired but still OPEN/MATCHED, move to PENDING_RESULT
  if v_bet.status in ('OPEN', 'MATCHED') and v_bet.expires_at is not null and v_bet.expires_at <= now() then
    update public.bets
       set status = 'PENDING_RESULT'
     where id = p_bet_id;

    -- Refresh the bet record after update
    select * into v_bet from public.bets where id = p_bet_id;
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
