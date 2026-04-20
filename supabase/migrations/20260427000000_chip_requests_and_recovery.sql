-- Chip Limits & Recovery (Go Fund Me system):
--   * chip_requests gains requested_amount / fulfilled_amount / message
--     so a request has a concrete target and a visible funding progress.
--   * ledger_entries.chip_request_id links each DONATION pair back to
--     the request it funded. Non-donation rows leave it null.
--   * RPCs:
--       set_room_chip_limit(room_id, limit) — admin-only, lets an
--         admin edit the room's floor mid-session without a new room.
--       request_chips(room_id, amount, message) — post a public ask
--         when you're at or past the floor.
--       donate_chips(request_id, amount) — fund a peer's request.
--         Writes two DONATION ledger rows and bumps fulfilled_amount.
--         Donors must still respect their own floor (no cascading begs).
--       cancel_chip_request(request_id) — requester-only, only while
--         the request is OPEN and has zero donations.
--   * create_bet gains a loss-floor check mirroring join_bet so the
--     creator's pre-match stake can't dip below per_user_chip_limit.
--
-- Realtime: chip_requests is already published (20260411060000); the
-- UPDATE that bumps fulfilled_amount / flips status broadcasts to
-- clients automatically.

-- ============================================================
-- 1. chip_requests schema additions
-- ============================================================

-- requested_amount: target of the GoFundMe ask. Default-then-drop so adding
-- the NOT NULL column is safe even if legacy rows exist (the table is a
-- stub with no writer, but be defensive).
alter table public.chip_requests
  add column if not exists requested_amount int not null default 1
    check (requested_amount > 0);
alter table public.chip_requests
  alter column requested_amount drop default;

alter table public.chip_requests
  add column if not exists fulfilled_amount int not null default 0
    check (fulfilled_amount >= 0);

alter table public.chip_requests
  add column if not exists message text;

-- Progress can't exceed the goal; status=FULFILLED means equality.
alter table public.chip_requests
  drop constraint if exists chip_requests_fulfilled_lte_requested;
alter table public.chip_requests
  add constraint chip_requests_fulfilled_lte_requested
    check (fulfilled_amount <= requested_amount);

-- One OPEN request per (room, user); the unique index is also enforced
-- by request_chips but the constraint is the real guarantee under race.
create unique index if not exists chip_requests_one_open_per_member_idx
  on public.chip_requests (room_id, requested_by)
  where status = 'OPEN';

-- Feed query index (latest-first scan by room+status).
create index if not exists chip_requests_room_status_created_idx
  on public.chip_requests (room_id, status, created_at desc);

-- ============================================================
-- 2. ledger_entries.chip_request_id link
-- ============================================================

alter table public.ledger_entries
  add column if not exists chip_request_id uuid
    references public.chip_requests(id) on delete set null;

create index if not exists ledger_entries_chip_request_id_idx
  on public.ledger_entries (chip_request_id)
  where chip_request_id is not null;

-- DONATION rows must reference the chip_request they funded. NOT VALID so
-- the constraint applies to new inserts without having to validate the
-- (empty) legacy rows.
alter table public.ledger_entries
  drop constraint if exists ledger_entries_donation_has_request;
alter table public.ledger_entries
  add constraint ledger_entries_donation_has_request
    check ((type <> 'DONATION') or (chip_request_id is not null)) not valid;

-- ============================================================
-- 3. set_room_chip_limit RPC — admin edits the floor mid-session
-- ============================================================

create or replace function public.set_room_chip_limit(p_room_id uuid, p_limit int)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0601';
  end if;

  if not public.is_room_admin(p_room_id) then
    raise exception 'Only an admin can change the chip limit' using errcode = 'P0602';
  end if;

  -- p_limit is allowed to be null (no floor) or any int (negative floors
  -- are the norm for this feature).

  update public.rooms
     set per_user_chip_limit = p_limit
   where id = p_room_id
  returning * into v_room;

  if v_room is null then
    raise exception 'Room not found' using errcode = 'P0603';
  end if;

  return v_room;
end;
$$;

revoke all on function public.set_room_chip_limit(uuid, int) from public;
grant execute on function public.set_room_chip_limit(uuid, int) to authenticated;

-- ============================================================
-- 4. request_chips RPC — member posts a GoFundMe ask
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

  -- Only members at or past the loss floor can request. If the room has
  -- no floor, any member can request (rare: the feature is built around
  -- having a floor, but don't block it).
  if v_room.per_user_chip_limit is not null
     and v_balance > v_room.per_user_chip_limit then
    raise exception 'You can only request chips when you''re at the chip limit' using errcode = 'P0617';
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
-- 5. donate_chips RPC — fund a peer's request
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

  -- Donor honours their own loss floor; begs don't cascade.
  select coalesce(sum(amount), 0) into v_donor_balance
    from public.ledger_entries
   where room_id = v_req.room_id and user_id = auth.uid();

  if v_room.per_user_chip_limit is not null
     and (v_donor_balance - p_amount) < v_room.per_user_chip_limit then
    raise exception 'You would exceed the loss limit for this room' using errcode = 'P0630';
  end if;

  -- One DONATION pair: donor -p_amount, requester +p_amount, both
  -- linked to the chip_request.
  insert into public.ledger_entries (room_id, type, user_id, amount, chip_request_id)
  values
    (v_req.room_id, 'DONATION', auth.uid(),         -p_amount, v_req.id),
    (v_req.room_id, 'DONATION', v_req.requested_by,  p_amount, v_req.id);

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
-- 6. cancel_chip_request RPC — requester-only back-out
-- ============================================================

create or replace function public.cancel_chip_request(p_chip_request_id uuid)
returns public.chip_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.chip_requests;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0631';
  end if;

  select * into v_req from public.chip_requests
   where id = p_chip_request_id for update;
  if v_req is null then
    raise exception 'Chip request not found' using errcode = 'P0632';
  end if;

  if v_req.requested_by is distinct from auth.uid() then
    raise exception 'Only the requester can cancel this request' using errcode = 'P0633';
  end if;

  if v_req.status is distinct from 'OPEN' then
    raise exception 'Chip request is not open' using errcode = 'P0634';
  end if;

  -- Partial donations stay with the requester; we don't reverse them.
  -- Cancellation is only allowed before anyone has chipped in.
  if v_req.fulfilled_amount > 0 then
    raise exception 'Cannot cancel a request that has received donations' using errcode = 'P0635';
  end if;

  update public.chip_requests
     set status = 'EXPIRED'
   where id = v_req.id
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function public.cancel_chip_request(uuid) from public;
grant execute on function public.cancel_chip_request(uuid) to authenticated;

-- ============================================================
-- 7. create_bet — add loss-floor check before the creator's stake
-- ============================================================
--
-- join_bet already enforces (balance - stake) >= per_user_chip_limit for
-- joiners; the corresponding check on the creator was missing. Keep the
-- rest of the body byte-identical to 20260422000000_multi_player_bets.sql
-- so future diffs stay small.

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

  -- Loss-floor check for the creator's pre-match stake. Mirrors join_bet.
  select coalesce(sum(amount), 0) into v_balance
    from public.ledger_entries
   where room_id = p_room_id and user_id = auth.uid();

  if v_room.per_user_chip_limit is not null
     and (v_balance - p_stake) < v_room.per_user_chip_limit then
    raise exception 'You would exceed the loss limit for this room' using errcode = 'P0015';
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
  values (v_bet.room_id, 'BET', v_bet.id, auth.uid(), -v_bet.stake);

  return v_bet;
end;
$$;

grant execute on function public.create_bet(uuid, text, jsonb, int, timestamptz, text, uuid, text, uuid, text)
  to authenticated;
