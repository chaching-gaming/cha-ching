-- Make bet subject optional
-- Previously, every bet required a subject_user_id (the player the bet is about)
-- and write-in bets required subject_positive_option when the subject wasn't the creator.
-- Now, bets can be created without a subject, allowing general bets not about a specific player.

create or replace function public.create_bet(
  p_room_id uuid,
  p_question text,
  p_options jsonb,
  p_stake int,
  p_expires_at timestamptz,
  p_offered_pick text,
  p_subject_user_id uuid default null,
  p_subject_positive_option text default null,
  p_template_id uuid default null,
  p_subject_display_name text default null
)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_q text;
  v_opts jsonb;
  v_len int;
  v_i int;
  v_j int;
  v_s text;
  v_pick text;
  v_pick_ok boolean := false;
  v_subject_opt text;
  v_subject_opt_ok boolean := false;
  v_tpl public.question_templates;
  v_tpl_norm jsonb;
  v_bet public.bets;
  v_expected_q text;
  v_balance numeric;
begin
  if not public.is_room_member(p_room_id) then
    raise exception 'Not a member of this room' using errcode = 'P0001';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if v_room is null then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;
  if not v_room.is_active then
    raise exception 'Session is not active' using errcode = 'P0003';
  end if;

  v_q := trim(p_question);
  if v_q = '' then
    raise exception 'Question is required' using errcode = 'P0004';
  end if;

  if p_stake is null or p_stake <= 0 then
    raise exception 'Stake must be a positive number' using errcode = 'P0005';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Expiry must be in the future' using errcode = 'P0006';
  end if;

  if jsonb_typeof(p_options) != 'array' then
    raise exception 'Options must be a JSON array' using errcode = 'P0007';
  end if;

  v_len := jsonb_array_length(p_options);
  if v_len < 2 or v_len > 6 then
    raise exception 'Options must have between 2 and 6 entries' using errcode = 'P0008';
  end if;

  v_opts := '[]'::jsonb;
  for v_i in 0..(v_len - 1) loop
    if jsonb_typeof(p_options -> v_i) is distinct from 'string' then
      raise exception 'Each option must be a string' using errcode = 'P0009';
    end if;
    v_s := trim(p_options ->> v_i);
    if v_s = '' then
      raise exception 'Options cannot be empty' using errcode = 'P0010';
    end if;
    for v_j in 0..(jsonb_array_length(v_opts) - 1) loop
      if lower(v_opts ->> v_j) = lower(v_s) then
        raise exception 'Duplicate options are not allowed' using errcode = 'P0011';
      end if;
    end loop;
    v_opts := v_opts || jsonb_build_array(v_s);
  end loop;

  -- Creator's pick must be one of the normalized options.
  if p_offered_pick is null then
    raise exception 'Your pick is required' using errcode = 'P0016';
  end if;
  v_pick := trim(p_offered_pick);
  if v_pick = '' then
    raise exception 'Your pick is required' using errcode = 'P0016';
  end if;
  for v_i in 0..(jsonb_array_length(v_opts) - 1) loop
    if lower(v_opts ->> v_i) = lower(v_pick) then
      v_pick := v_opts ->> v_i;
      v_pick_ok := true;
      exit;
    end if;
  end loop;
  if not v_pick_ok then
    raise exception 'Your pick is not a valid option' using errcode = 'P0017';
  end if;

  -- Subject is now optional. If provided, must be a room member.
  if p_subject_user_id is not null then
    if not exists (
      select 1 from public.room_members
      where room_id = p_room_id and user_id = p_subject_user_id
    ) then
      raise exception 'Subject must be a member of this room' using errcode = 'P0019';
    end if;
  end if;

  -- Template handling
  if p_template_id is not null then
    select * into v_tpl from public.question_templates where id = p_template_id;
    if v_tpl is null then
      raise exception 'Template not found' using errcode = 'P0012';
    end if;
    if p_subject_display_name is null or trim(p_subject_display_name) = '' then
      raise exception 'Player name is required for this template' using errcode = 'P0015';
    end if;
    v_expected_q := trim(replace(trim(v_tpl.question_text), '{player}', trim(p_subject_display_name)));
    if v_q is distinct from v_expected_q then
      raise exception 'Question does not match template' using errcode = 'P0013';
    end if;
    v_tpl_norm := '[]'::jsonb;
    for v_i in 0..(jsonb_array_length(v_tpl.options) - 1) loop
      v_tpl_norm := v_tpl_norm || jsonb_build_array(trim(v_tpl.options ->> v_i));
    end loop;
    if v_tpl_norm is distinct from v_opts then
      raise exception 'Options do not match template' using errcode = 'P0014';
    end if;
    -- Derive subject_positive_option from template when caller didn't override.
    if p_subject_positive_option is null then
      v_subject_opt := v_tpl.subject_positive_option;
    else
      v_subject_opt := trim(p_subject_positive_option);
    end if;
  else
    -- Write-in: subject_positive_option is now optional
    if p_subject_positive_option is not null and trim(p_subject_positive_option) <> '' then
      v_subject_opt := trim(p_subject_positive_option);
    elsif p_subject_user_id is not null and auth.uid() is not distinct from p_subject_user_id then
      -- If creator is the subject, default to their pick
      v_subject_opt := v_pick;
    else
      -- No subject or subject is not creator - no restriction needed
      v_subject_opt := null;
    end if;
  end if;

  -- Canonicalize + validate subject_positive_option against the option set (only if set).
  if v_subject_opt is not null then
    for v_i in 0..(jsonb_array_length(v_opts) - 1) loop
      if lower(v_opts ->> v_i) = lower(v_subject_opt) then
        v_subject_opt := v_opts ->> v_i;
        v_subject_opt_ok := true;
        exit;
      end if;
    end loop;
    if not v_subject_opt_ok then
      raise exception 'Subject allowed side is not a valid option' using errcode = 'P0021';
    end if;
  end if;

  -- If creator is the subject and there's a restriction, they must pick the allowed side.
  if p_subject_user_id is not null
     and auth.uid() is not distinct from p_subject_user_id
     and v_subject_opt is not null
     and lower(v_pick) <> lower(v_subject_opt) then
    raise exception 'You can''t bet against yourself on this question' using errcode = 'P0022';
  end if;

  -- Zero floor check: balance after stake must be >= 0
  select coalesce(sum(amount), 0) into v_balance
    from public.ledger_entries
   where room_id = p_room_id and user_id = auth.uid();

  if (v_balance - p_stake) < 0 then
    raise exception 'You don''t have enough chips' using errcode = 'P0015';
  end if;

  insert into public.bets (
    room_id,
    question,
    options,
    stake,
    expires_at,
    status,
    offered_by,
    offered_pick,
    subject_user_id,
    subject_positive_option,
    template_id
  )
  values (
    p_room_id,
    v_q,
    v_opts,
    p_stake,
    p_expires_at,
    'OPEN',
    auth.uid(),
    v_pick,
    p_subject_user_id,
    v_subject_opt,
    case when p_template_id is null then null else p_template_id::text end
  )
  returning * into v_bet;

  -- Creator's stake + ledger entry.
  insert into public.bet_stakes (bet_id, user_id, pick, stake)
  values (v_bet.id, auth.uid(), v_pick, p_stake);

  insert into public.ledger_entries (room_id, type, bet_id, user_id, amount)
  values (v_bet.room_id, 'STAKE_LOCK', v_bet.id, auth.uid(), -v_bet.stake);

  return v_bet;
end;
$$;
