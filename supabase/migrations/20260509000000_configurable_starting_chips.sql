-- Configurable starting chips + zero floor (no negative balances)
--
-- Changes:
--   1. Add `starting_chips` column to rooms (default 1000)
--   2. Update `create_room` to accept `p_starting_chips` parameter
--   3. Update `grant_starting_chips` trigger to use room's starting_chips
--   4. Update loss-floor checks in create_bet, join_bet, donate_chips to use 0
--   5. Update request_chips to check balance <= 0
--   6. Remove per_user_chip_limit functionality (keep column for backwards compat)

-- ============================================================
-- 1. Add starting_chips column to rooms
-- ============================================================

alter table public.rooms
  add column if not exists starting_chips int not null default 1000
    check (starting_chips > 0 and starting_chips <= 100000);

-- ============================================================
-- 2. Update create_room RPC
-- ============================================================

-- Drop old function signatures
drop function if exists public.create_room(text, date, int);
drop function if exists public.create_room(text, date);

create or replace function public.create_room(
  p_name text,
  p_session_date date,
  p_starting_chips int default 1000
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_code text;
  v_room public.rooms;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_exists boolean;
  v_starting int;
  v_full_name text;
begin
  -- Validate starting chips
  v_starting := coalesce(p_starting_chips, 1000);
  if v_starting <= 0 or v_starting > 100000 then
    raise exception 'Starting chips must be between 1 and 100,000' using errcode = 'P0004';
  end if;

  -- Build session name: user-provided name + date
  v_full_name := p_name || ' - ' || to_char(p_session_date, 'YYYY-MM-DD');

  -- Generate unique 6-char invite code
  loop
    v_invite_code := '';
    for i in 1..6 loop
      v_invite_code := v_invite_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;

    select exists(select 1 from public.rooms where invite_code = v_invite_code) into v_exists;
    exit when not v_exists;
  end loop;

  -- Insert room with starting_chips
  insert into public.rooms (name, invite_code, created_by, starting_chips, per_user_chip_limit, session_date, is_active)
  values (v_full_name, v_invite_code, auth.uid(), v_starting, null, p_session_date, true)
  returning * into v_room;

  -- Insert creator as ADMIN member
  insert into public.room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'ADMIN');

  return v_room;
end;
$$;

grant execute on function public.create_room(text, date, int) to authenticated;

-- ============================================================
-- 3. Update grant_starting_chips trigger to use room's value
-- ============================================================

create or replace function public.grant_starting_chips()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starting_chips int;
begin
  -- Get the room's starting_chips value
  select coalesce(starting_chips, 1000) into v_starting_chips
    from public.rooms
   where id = new.room_id;

  insert into public.ledger_entries (room_id, user_id, type, amount)
  values (new.room_id, new.user_id, 'GRANT', v_starting_chips)
  on conflict (room_id, user_id) where type = 'GRANT' do nothing;

  return new;
end;
$$;

-- ============================================================
-- 4. Update create_bet — zero floor instead of per_user_chip_limit
-- ============================================================

create or replace function public.create_bet(
  p_room_id uuid,
  p_question text,
  p_options jsonb,
  p_stake int,
  p_expires_at timestamptz,
  p_offered_pick text,
  p_subject_user_id uuid,
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

  -- Subject is required and must be a room member.
  if p_subject_user_id is null then
    raise exception 'Subject is required' using errcode = 'P0018';
  end if;
  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = p_subject_user_id
  ) then
    raise exception 'Subject must be a member of this room' using errcode = 'P0019';
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
    -- Write-in: if omitted, fall back to creator's pick when creator is the subject.
    if p_subject_positive_option is not null and trim(p_subject_positive_option) <> '' then
      v_subject_opt := trim(p_subject_positive_option);
    elsif auth.uid() is not distinct from p_subject_user_id then
      v_subject_opt := v_pick;
    else
      raise exception 'Subject allowed side is required for write-in bets' using errcode = 'P0020';
    end if;
  end if;

  -- Canonicalize + validate subject_positive_option against the option set.
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

  -- If creator is the subject, they must pick the allowed side.
  if auth.uid() is not distinct from p_subject_user_id
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

grant execute on function public.create_bet(uuid, text, jsonb, int, timestamptz, text, uuid, text, uuid, text)
  to authenticated;

-- ============================================================
-- 5. Update join_bet — zero floor instead of per_user_chip_limit
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

  return v_bet;
end;
$$;

revoke all on function public.join_bet(uuid, text) from public;
grant execute on function public.join_bet(uuid, text) to authenticated;

-- ============================================================
-- 6. Update donate_chips — zero floor instead of per_user_chip_limit
-- ============================================================

create or replace function public.donate_chips(
  p_chip_request_id uuid,
  p_amount int
)
returns public.chip_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.chip_requests;
  v_room public.rooms;
  v_donor_balance numeric;
  v_remaining int;
  v_new_fulfilled int;
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0621';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Donation amount must be positive' using errcode = 'P0622';
  end if;

  select * into v_req from public.chip_requests
   where id = p_chip_request_id for update;
  if v_req is null then
    raise exception 'Chip request not found' using errcode = 'P0623';
  end if;

  if v_req.status is distinct from 'OPEN' then
    raise exception 'Chip request is not open' using errcode = 'P0624';
  end if;

  if v_req.requested_by = auth.uid() then
    raise exception 'You cannot donate to your own request' using errcode = 'P0625';
  end if;

  if not public.is_room_member(v_req.room_id) then
    raise exception 'Not a member of this room' using errcode = 'P0626';
  end if;

  select * into v_room from public.rooms where id = v_req.room_id;
  if v_room is null then
    raise exception 'Room not found' using errcode = 'P0627';
  end if;
  if not v_room.is_active then
    raise exception 'Session is not active' using errcode = 'P0628';
  end if;

  v_remaining := v_req.requested_amount - v_req.fulfilled_amount;
  if p_amount > v_remaining then
    raise exception 'Donation exceeds remaining need' using errcode = 'P0629';
  end if;

  -- Zero floor check: donor's balance after donation must be >= 0
  select coalesce(sum(amount), 0) into v_donor_balance
    from public.ledger_entries
   where room_id = v_req.room_id and user_id = auth.uid();

  if (v_donor_balance - p_amount) < 0 then
    raise exception 'You don''t have enough chips to donate' using errcode = 'P0630';
  end if;

  -- One DONATION pair: donor -p_amount (DONATION_OUT), requester +p_amount (DONATION_IN),
  -- both linked to the chip_request.
  insert into public.ledger_entries (room_id, type, user_id, amount, chip_request_id)
  values
    (v_req.room_id, 'DONATION_OUT', auth.uid(),         -p_amount, v_req.id),
    (v_req.room_id, 'DONATION_IN',  v_req.requested_by,  p_amount, v_req.id);

  v_new_fulfilled := v_req.fulfilled_amount + p_amount;
  v_new_status := case
    when v_new_fulfilled >= v_req.requested_amount then 'FULFILLED'
    else 'OPEN'
  end;

  update public.chip_requests
     set fulfilled_amount = v_new_fulfilled,
         status = v_new_status
   where id = v_req.id
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function public.donate_chips(uuid, int) from public;
grant execute on function public.donate_chips(uuid, int) to authenticated;

-- ============================================================
-- 7. Update request_chips — check balance <= 0 (zero floor)
-- ============================================================

create or replace function public.request_chips(
  p_room_id uuid,
  p_amount int,
  p_message text default null
)
returns public.chip_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_balance numeric;
  v_request public.chip_requests;
  v_msg text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0611';
  end if;

  if not public.is_room_member(p_room_id) then
    raise exception 'Not a member of this room' using errcode = 'P0612';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if v_room is null then
    raise exception 'Room not found' using errcode = 'P0613';
  end if;
  if not v_room.is_active then
    raise exception 'Session is not active' using errcode = 'P0614';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Request amount must be a positive number' using errcode = 'P0615';
  end if;
  if p_amount > 100000 then
    raise exception 'Request amount is too large' using errcode = 'P0616';
  end if;

  select coalesce(sum(amount), 0) into v_balance
    from public.ledger_entries
   where room_id = p_room_id and user_id = auth.uid();

  -- Only members at zero balance can request chips (fund me feature)
  if v_balance > 0 then
    raise exception 'You can only request chips when your balance is zero' using errcode = 'P0617';
  end if;

  if exists (
    select 1 from public.chip_requests
     where room_id = p_room_id
       and requested_by = auth.uid()
       and status = 'OPEN'
  ) then
    raise exception 'You already have an open chip request in this room' using errcode = 'P0618';
  end if;

  v_msg := nullif(trim(coalesce(p_message, '')), '');

  insert into public.chip_requests
    (room_id, requested_by, current_balance, status,
     requested_amount, fulfilled_amount, message)
  values
    (p_room_id, auth.uid(), v_balance, 'OPEN',
     p_amount, 0, v_msg)
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.request_chips(uuid, int, text) from public;
grant execute on function public.request_chips(uuid, int, text) to authenticated;

-- ============================================================
-- 8. Drop set_room_chip_limit RPC (no longer needed)
-- ============================================================

drop function if exists public.set_room_chip_limit(uuid, int);
