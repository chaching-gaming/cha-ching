-- Add STAKE_LOCK type for clarity when placing bets.
-- Previously BET_LOSS was used for both stake locks and actual losses.
-- Now: STAKE_LOCK = chips locked when placing a bet
--      BET_LOSS = (reserved for future use if needed, or legacy data)
--      BET_WIN = chips won when bet settles in your favor

-- ============================================================
-- 0. Update constraint to include STAKE_LOCK
-- ============================================================

alter table public.ledger_entries drop constraint ledger_entries_type_check;
alter table public.ledger_entries
  add constraint ledger_entries_type_check
    check (type in ('BET_WIN', 'BET_LOSS', 'STAKE_LOCK', 'VOID_REFUND', 'DONATION_IN', 'DONATION_OUT', 'GRANT'));

-- ============================================================
-- 1. Fix create_bet function
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

-- ============================================================
-- 2. Fix join_bet function
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

-- ============================================================
-- 3. Fix donate_chips function
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

  -- DONATION_OUT for donor (negative), DONATION_IN for requester (positive)
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

-- ============================================================
-- 4. Update stats RPCs to handle both STAKE_LOCK (new) and BET_LOSS (legacy)
-- ============================================================

create or replace function public.get_room_player_stats(p_room_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  balance numeric,
  wins int,
  losses int,
  category_breakdown jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  with per_user as (
    select
      rm.user_id,
      coalesce(sum(le.amount), 0)::numeric as balance,
      count(distinct case when le.type = 'BET_WIN' then le.bet_id end)::int as wins,
      count(distinct case
        -- Handle both legacy BET_LOSS and new STAKE_LOCK
        when le.type in ('BET_LOSS', 'STAKE_LOCK') and b.status = 'SETTLED' then le.bet_id
      end)::int as stakes_in_settled
    from public.room_members rm
    left join public.ledger_entries le
      on le.room_id = rm.room_id and le.user_id = rm.user_id
    left join public.bets b on b.id = le.bet_id
    where rm.room_id = p_room_id
      and public.is_room_member(p_room_id)
    group by rm.user_id
  ),
  -- Per-(user, template) bet outcomes. One row per bet the user staked in
  -- with its final status and whether they won.
  per_user_bet as (
    select distinct on (le.user_id, le.bet_id)
      le.user_id,
      le.bet_id,
      b.status,
      b.template_id,
      exists (
        select 1 from public.ledger_entries lew
        where lew.bet_id = le.bet_id and lew.user_id = le.user_id and lew.type = 'BET_WIN'
      ) as won
    from public.ledger_entries le
    join public.bets b on b.id = le.bet_id
    where le.room_id = p_room_id
      -- Handle both legacy BET_LOSS and new STAKE_LOCK
      and le.type in ('BET_LOSS', 'STAKE_LOCK')
      and b.status = 'SETTLED'
  ),
  per_user_category as (
    select
      pub.user_id,
      qt.slug as template_slug,
      qt.short_label as template_label,
      count(*)::int as bets,
      sum(case when pub.won then 1 else 0 end)::int as wins,
      sum(case when pub.won then 0 else 1 end)::int as losses
    from per_user_bet pub
    left join public.question_templates qt
      on pub.template_id is not null and qt.id = pub.template_id::uuid
    group by pub.user_id, qt.slug, qt.short_label
  ),
  per_user_agg_breakdown as (
    select
      puc.user_id,
      jsonb_agg(
        jsonb_build_object(
          'template_slug', puc.template_slug,
          'template_label', coalesce(puc.template_label, 'Write-in'),
          'bets', puc.bets,
          'wins', puc.wins,
          'losses', puc.losses
        )
        order by puc.bets desc, coalesce(puc.template_label, 'Write-in') asc
      ) as category_breakdown
    from per_user_category puc
    group by puc.user_id
  )
  select
    pu.user_id,
    p.display_name,
    p.avatar_url,
    pu.balance,
    pu.wins,
    greatest(pu.stakes_in_settled - pu.wins, 0)::int as losses,
    coalesce(ab.category_breakdown, '[]'::jsonb) as category_breakdown
  from per_user pu
  join public.profiles p on p.id = pu.user_id
  left join per_user_agg_breakdown ab on ab.user_id = pu.user_id
  order by pu.balance desc, p.display_name asc;
$$;

create or replace function public.get_room_event_stats(p_room_id uuid)
returns table (
  total_bets int,
  open_bets int,
  matched_bets int,
  settled_bets int,
  voided_bets int,
  total_chips_wagered numeric,
  total_donations numeric,
  total_members int,
  popular_templates jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  with bet_counts as (
    select
      count(*)::int as total_bets,
      count(*) filter (where status = 'OPEN')::int as open_bets,
      count(*) filter (where status in ('MATCHED', 'PENDING_RESULT', 'DISPUTED'))::int as matched_bets,
      count(*) filter (where status = 'SETTLED')::int as settled_bets,
      count(*) filter (where status = 'VOID')::int as voided_bets
    from public.bets
    where room_id = p_room_id
  ),
  chip_flows as (
    select
      -- Handle both legacy BET_LOSS and new STAKE_LOCK
      coalesce(sum(abs(amount)) filter (where type in ('BET_LOSS', 'STAKE_LOCK')), 0)::numeric as total_chips_wagered,
      coalesce(sum(amount) filter (where type = 'DONATION_IN'), 0)::numeric as total_donations
    from public.ledger_entries
    where room_id = p_room_id
  ),
  member_count as (
    select count(*)::int as total_members
    from public.room_members
    where room_id = p_room_id
  ),
  template_counts as (
    -- Top 5 templates by bet count, alphabetical tiebreak. Write-in bets
    -- (template_id is null) fold into a single `Write-in` bucket.
    select
      coalesce(qt.slug, null) as template_slug,
      coalesce(qt.short_label, 'Write-in') as label,
      count(*)::int as bet_count
    from public.bets b
    left join public.question_templates qt
      on b.template_id is not null and qt.id = b.template_id::uuid
    where b.room_id = p_room_id
    group by qt.slug, qt.short_label
    order by bet_count desc, label asc
    limit 5
  ),
  templates_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'template_slug', template_slug,
          'label', label,
          'bet_count', bet_count
        )
      ),
      '[]'::jsonb
    ) as popular_templates
    from template_counts
  )
  select
    bc.total_bets,
    bc.open_bets,
    bc.matched_bets,
    bc.settled_bets,
    bc.voided_bets,
    cf.total_chips_wagered,
    cf.total_donations,
    mc.total_members,
    tj.popular_templates
  from bet_counts bc
  cross join chip_flows cf
  cross join member_count mc
  cross join templates_json tj
  where public.is_room_member(p_room_id);
$$;

-- ============================================================
-- 5. Update get_room_member_balances to handle STAKE_LOCK
-- ============================================================

create or replace function public.get_room_member_balances(p_room_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  balance numeric,
  wins int,
  losses int
)
language sql
security definer
set search_path = public
stable
as $$
  with member_stats as (
    select
      rm.user_id,
      coalesce(sum(le.amount), 0)::numeric as balance,
      count(distinct case when le.type = 'BET_WIN' then le.bet_id end)::int as wins,
      count(distinct case
        -- Handle both legacy BET_LOSS and new STAKE_LOCK
        when le.type in ('BET_LOSS', 'STAKE_LOCK') and b.status = 'SETTLED' then le.bet_id
      end)::int as stakes_in_settled
    from public.room_members rm
    left join public.ledger_entries le
      on le.room_id = rm.room_id and le.user_id = rm.user_id
    left join public.bets b on b.id = le.bet_id
    where rm.room_id = p_room_id
      and public.is_room_member(p_room_id)
    group by rm.user_id
  )
  select
    ms.user_id,
    p.display_name,
    p.avatar_url,
    ms.balance,
    ms.wins,
    greatest(ms.stakes_in_settled - ms.wins, 0)::int as losses
  from member_stats ms
  join public.profiles p on p.id = ms.user_id
  order by ms.balance desc, p.display_name asc;
$$;
