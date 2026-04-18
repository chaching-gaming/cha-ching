-- Migrate bets from 1-on-1 to multi-player prop bets.
--   * N backers per bet via a new bet_stakes(bet_id, user_id, pick, stake) table
--   * Subject (the player a bet is about) can't bet against themselves
--   * One-sided bets at expiry auto-void and refund everyone
--   * Settlement splits the total pool pro-rata among the winning side
--
-- Backwards-compat: `accept_bet` stays as a thin shim calling `join_bet` so
-- mobile builds from either release keep working. The `accepted_by` /
-- `accepted_pick` columns are left in place for legacy data but the new code
-- reads from bet_stakes exclusively.

-- ============================================================
-- 1. Schema: bets subject + bet_stakes table + ledger REFUND
-- ============================================================

alter table public.bets
  add column if not exists subject_user_id uuid references public.profiles(id);

alter table public.bets
  add column if not exists subject_positive_option text;

alter table public.question_templates
  add column if not exists subject_positive_option text;

-- Template backfill: fairway / green / putt reward "Yes" (positive action);
-- three_putt's positive side for the subject is "No" (they'd want to not three-putt).
update public.question_templates
  set subject_positive_option = 'Yes'
  where slug in ('fairway', 'green', 'putt');

update public.question_templates
  set subject_positive_option = 'No'
  where slug = 'three_putt';

-- ledger_entries.type now supports REFUND (one-sided auto-void path).
alter table public.ledger_entries drop constraint ledger_entries_type_check;
alter table public.ledger_entries
  add constraint ledger_entries_type_check
    check (type in ('BET', 'DONATION', 'WIN', 'REFUND'));

create table if not exists public.bet_stakes (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  pick text not null,
  stake int not null check (stake > 0),
  created_at timestamp default now(),
  unique (bet_id, user_id)
);

create index if not exists bet_stakes_bet_id_idx on public.bet_stakes (bet_id);
create index if not exists bet_stakes_user_id_idx on public.bet_stakes (user_id);

alter table public.bet_stakes enable row level security;

create policy "Room members can view bet stakes"
on public.bet_stakes for select
using (
  exists (
    select 1 from public.bets b
    where b.id = bet_stakes.bet_id
      and public.is_room_member(b.room_id)
  )
);

-- bet_stakes mutations happen through RPCs (join_bet / create_bet) only.
-- No direct INSERT / UPDATE / DELETE policies so RLS denies by default.

alter publication supabase_realtime add table public.bet_stakes;

-- ============================================================
-- 2. Backfill bet_stakes from existing 1:1 columns
-- ============================================================

-- Every existing offerer gets a stake row on their side.
insert into public.bet_stakes (bet_id, user_id, pick, stake)
select id, offered_by, offered_pick, stake
  from public.bets
 where offered_by is not null
   and offered_pick is not null
on conflict (bet_id, user_id) do nothing;

-- Every existing acceptor gets a stake row on their side.
insert into public.bet_stakes (bet_id, user_id, pick, stake)
select id, accepted_by, accepted_pick, stake
  from public.bets
 where accepted_by is not null
   and accepted_pick is not null
on conflict (bet_id, user_id) do nothing;

-- Existing bets already have BET ledger entries (written by the old
-- accept_bet). We don't regenerate them; backfill only covers bet_stakes.

-- ============================================================
-- 3. create_bet — add subject + stake the creator in bet_stakes
-- ============================================================

revoke execute on function public.create_bet(uuid, text, jsonb, int, timestamptz, text, uuid, text)
  from authenticated;
drop function public.create_bet(uuid, text, jsonb, int, timestamptz, text, uuid, text);

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

-- ============================================================
-- 4. join_bet — any backer on any side, subject-rule enforced
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

  -- Loss-floor check for the joining user.
  select coalesce(sum(amount), 0) into v_balance
    from public.ledger_entries
   where room_id = v_bet.room_id and user_id = auth.uid();

  if v_room.per_user_chip_limit is not null
     and (v_balance - v_bet.stake) < v_room.per_user_chip_limit then
    raise exception 'You would exceed the loss limit for this room' using errcode = 'P0015';
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
  values (v_bet.room_id, 'BET', v_bet.id, auth.uid(), -v_bet.stake);

  return v_bet;
end;
$$;

revoke all on function public.join_bet(uuid, text) from public;
grant execute on function public.join_bet(uuid, text) to authenticated;

-- ============================================================
-- 5. accept_bet — thin shim to join_bet (legacy clients)
-- ============================================================

create or replace function public.accept_bet(p_bet_id uuid, p_pick text)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.join_bet(p_bet_id, p_pick);
end;
$$;

grant execute on function public.accept_bet(uuid, text) to authenticated;

-- ============================================================
-- 6. expire_open_bets — auto-void one-sided, else PENDING_RESULT
-- ============================================================

create or replace function public.expire_open_bets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_picks int;
  v_count int := 0;
begin
  for v_bet in
    select * from public.bets
     where status = 'OPEN'
       and expires_at is not null
       and expires_at < now()
  loop
    -- Count distinct picks staked on this bet.
    select count(distinct pick) into v_picks
      from public.bet_stakes
     where bet_id = v_bet.id;

    if v_picks >= 2 then
      update public.bets set status = 'PENDING_RESULT' where id = v_bet.id;
    else
      -- One-sided (or no stakes): void + refund every staker.
      update public.bets set status = 'VOID' where id = v_bet.id;

      insert into public.ledger_entries (room_id, type, bet_id, user_id, amount)
      select v_bet.room_id, 'REFUND', v_bet.id, bs.user_id, bs.stake
        from public.bet_stakes bs
       where bs.bet_id = v_bet.id;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_open_bets() from public;

-- ============================================================
-- 7. submit_outcome — gate on bet_stakes membership, not offered_by
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
-- 8. settle_bet — consensus across all stakers, pool-split payout
-- ============================================================

create or replace function public.settle_bet(p_bet_id uuid)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_stakes_total int;
  v_subs_total int;
  v_distinct_picks int;
  v_outcome text;
  v_n_winners int;
  v_total_pool int;
  v_per_winner int;
begin
  select * into v_bet from public.bets where id = p_bet_id for update;
  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0402';
  end if;

  -- Idempotent: anything already finalized is a no-op.
  if v_bet.status in ('SETTLED', 'DISPUTED', 'VOID', 'EXPIRED') then
    return v_bet;
  end if;

  if v_bet.status is distinct from 'PENDING_RESULT' then
    return v_bet;
  end if;

  -- Everyone who staked must have submitted before we can consensus-settle.
  select count(*) into v_stakes_total from public.bet_stakes where bet_id = p_bet_id;
  select count(*) into v_subs_total from public.outcome_submissions where bet_id = p_bet_id;
  if v_subs_total < v_stakes_total then
    return v_bet;
  end if;

  select count(distinct selected_option) into v_distinct_picks
    from public.outcome_submissions where bet_id = p_bet_id;

  if v_distinct_picks = 1 then
    select selected_option into v_outcome
      from public.outcome_submissions where bet_id = p_bet_id limit 1;

    select count(*) into v_n_winners
      from public.bet_stakes
     where bet_id = p_bet_id
       and lower(trim(pick)) = lower(trim(v_outcome));

    v_total_pool := v_stakes_total * v_bet.stake;

    if v_n_winners > 0 then
      v_per_winner := v_total_pool / v_n_winners;

      insert into public.ledger_entries (room_id, type, bet_id, user_id, amount)
      select v_bet.room_id, 'WIN', v_bet.id, bs.user_id, v_per_winner
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
-- 9. resolve_dispute — attestor override, same pool-split payout
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
