-- Allow participants to submit an outcome as soon as the bet has stakes on both
-- sides. The first submission flips the bet from OPEN to PENDING_RESULT, which
-- closes it to new backers. Without this, users have to wait for the expiry
-- cron (runs every minute at bet.expires_at) before the "Submit outcome" CTA
-- appears — which is wrong for real-time prop bets where the event often
-- resolves seconds after the stakes lock.

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
  v_distinct_picks int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0301';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0302';
  end if;

  if v_bet.status not in ('OPEN', 'PENDING_RESULT') then
    raise exception 'Bet is not awaiting outcome submissions' using errcode = 'P0303';
  end if;

  -- While OPEN, submissions are only allowed once both sides have been staked.
  -- A one-sided OPEN bet means "waiting for a challenger" — if it's ever going
  -- to settle, it needs a counter-stake first.
  if v_bet.status = 'OPEN' then
    select count(distinct pick) into v_distinct_picks
      from public.bet_stakes
     where bet_id = p_bet_id;
    if v_distinct_picks < 2 then
      raise exception 'Bet needs backers on both sides before outcomes can be submitted'
        using errcode = 'P0308';
    end if;
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

  -- First submission on an OPEN bet closes the betting window. Idempotent:
  -- if status was already PENDING_RESULT, nothing changes.
  if v_bet.status = 'OPEN' then
    update public.bets set status = 'PENDING_RESULT' where id = p_bet_id;
  end if;

  perform public.settle_bet(p_bet_id);

  return v_submission;
end;
$$;
