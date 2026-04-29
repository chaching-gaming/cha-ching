-- Notification triggers for push notifications:
--   * Enable pg_net extension for HTTP calls from triggers
--   * Triggers:
--     - on_bet_matched: bets UPDATE to MATCHED -> notify all stakers + offerer
--     - on_bet_settled: bets UPDATE to SETTLED -> notify all participants
--     - on_bet_disputed: bets UPDATE to DISPUTED -> notify room admins
--     - on_chip_request_created: chip_requests INSERT -> notify room members (excl. requester)
--     - on_chip_donated: chip_requests UPDATE (fulfilled_amount increased) -> notify requester
--
-- Configuration requires:
--   alter database postgres set app.settings.edge_function_url = 'https://<project>.supabase.co/functions/v1';
--   alter database postgres set app.settings.service_role_key = '<service-role-key>';

-- ============================================================
-- 1. Enable pg_net extension
-- ============================================================

create extension if not exists pg_net with schema extensions;

-- ============================================================
-- 2. Helper: call send-notification Edge Function
-- ============================================================

create or replace function public.notify_users(
  p_type text,
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_data jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
  v_payload jsonb;
begin
  -- Skip if no users to notify
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return;
  end if;

  -- Get configuration from database settings
  v_url := current_setting('app.settings.edge_function_url', true);
  v_key := current_setting('app.settings.service_role_key', true);

  -- Skip if not configured (local dev without Edge Functions)
  if v_url is null or v_url = '' or v_key is null or v_key = '' then
    return;
  end if;

  v_payload := jsonb_build_object(
    'type', p_type,
    'user_ids', p_user_ids,
    'title', p_title,
    'body', p_body,
    'data', p_data
  );

  -- Fire and forget HTTP POST to Edge Function
  perform extensions.http_post(
    url := v_url || '/send-notification',
    body := v_payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )::json
  );
end;
$$;

-- ============================================================
-- 3. Trigger: on_bet_matched
-- ============================================================
-- When a bet transitions from OPEN to having 2+ sides (via join_bet),
-- it's considered "matched". Notify all stakers.

create or replace function public.trigger_bet_matched()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stakers uuid[];
  v_distinct_picks int;
begin
  -- Only fire when status is still OPEN
  if new.status is distinct from 'OPEN' then
    return new;
  end if;

  -- Check if bet now has stakers on 2+ distinct picks (matched)
  select count(distinct pick) into v_distinct_picks
  from public.bet_stakes
  where bet_id = new.id;

  -- Only notify when transitioning to 2 sides for the first time
  if v_distinct_picks = 2 then
    select array_agg(distinct user_id) into v_stakers
    from public.bet_stakes
    where bet_id = new.id;

    perform public.notify_users(
      'bet_matched',
      v_stakers,
      'Bet Matched!',
      'Your bet on "' || left(new.question, 50) || '" now has action on both sides!',
      jsonb_build_object('room_id', new.room_id, 'bet_id', new.id)
    );
  end if;

  return new;
end;
$$;

-- We trigger on bet_stakes insert since that's when matching happens
create or replace function public.trigger_bet_stakes_matched()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_stakers uuid[];
  v_distinct_picks int;
begin
  select * into v_bet from public.bets where id = new.bet_id;

  -- Only process OPEN bets
  if v_bet is null or v_bet.status is distinct from 'OPEN' then
    return new;
  end if;

  -- Check if this insertion created the second side
  select count(distinct pick) into v_distinct_picks
  from public.bet_stakes
  where bet_id = new.bet_id;

  -- Only notify when transitioning to exactly 2 sides
  if v_distinct_picks = 2 then
    select array_agg(distinct user_id) into v_stakers
    from public.bet_stakes
    where bet_id = new.bet_id;

    perform public.notify_users(
      'bet_matched',
      v_stakers,
      'Bet Matched!',
      'Your bet on "' || left(v_bet.question, 50) || '" now has action on both sides!',
      jsonb_build_object('room_id', v_bet.room_id, 'bet_id', v_bet.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_bet_stakes_matched on public.bet_stakes;
create trigger on_bet_stakes_matched
after insert on public.bet_stakes
for each row
execute function public.trigger_bet_stakes_matched();

-- ============================================================
-- 4. Trigger: on_bet_settled
-- ============================================================

create or replace function public.trigger_bet_settled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stakers uuid[];
begin
  -- Only fire on transition to SETTLED
  if old.status = 'SETTLED' or new.status is distinct from 'SETTLED' then
    return new;
  end if;

  select array_agg(distinct user_id) into v_stakers
  from public.bet_stakes
  where bet_id = new.id;

  perform public.notify_users(
    'bet_settled',
    v_stakers,
    'Bet Settled!',
    'The bet "' || left(new.question, 50) || '" has been settled. Outcome: ' || coalesce(new.outcome, 'N/A'),
    jsonb_build_object('room_id', new.room_id, 'bet_id', new.id, 'outcome', new.outcome)
  );

  return new;
end;
$$;

drop trigger if exists on_bet_settled on public.bets;
create trigger on_bet_settled
after update on public.bets
for each row
execute function public.trigger_bet_settled();

-- ============================================================
-- 5. Trigger: on_bet_disputed
-- ============================================================

create or replace function public.trigger_bet_disputed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admins uuid[];
begin
  -- Only fire on transition to DISPUTED
  if old.status = 'DISPUTED' or new.status is distinct from 'DISPUTED' then
    return new;
  end if;

  select array_agg(user_id) into v_admins
  from public.room_members
  where room_id = new.room_id
    and role in ('ADMIN', 'ATTESTOR');

  if v_admins is not null and array_length(v_admins, 1) > 0 then
    perform public.notify_users(
      'bet_disputed',
      v_admins,
      'Bet Disputed',
      'A bet needs your attention: "' || left(new.question, 50) || '"',
      jsonb_build_object('room_id', new.room_id, 'bet_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_bet_disputed on public.bets;
create trigger on_bet_disputed
after update on public.bets
for each row
execute function public.trigger_bet_disputed();

-- ============================================================
-- 6. Trigger: on_chip_request_created
-- ============================================================

create or replace function public.trigger_chip_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_members uuid[];
  v_requester_name text;
begin
  -- Get requester's display name
  select display_name into v_requester_name
  from public.profiles
  where id = new.requested_by;

  -- Get all room members except the requester
  select array_agg(user_id) into v_room_members
  from public.room_members
  where room_id = new.room_id
    and user_id is distinct from new.requested_by;

  if v_room_members is not null and array_length(v_room_members, 1) > 0 then
    perform public.notify_users(
      'chip_request_created',
      v_room_members,
      'Chip Request',
      coalesce(v_requester_name, 'Someone') || ' needs ' || new.requested_amount || ' chips!',
      jsonb_build_object('room_id', new.room_id, 'chip_request_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_chip_request_created on public.chip_requests;
create trigger on_chip_request_created
after insert on public.chip_requests
for each row
execute function public.trigger_chip_request_created();

-- ============================================================
-- 7. Trigger: on_chip_donated
-- ============================================================

create or replace function public.trigger_chip_donated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only fire when fulfilled_amount increases
  if new.fulfilled_amount <= old.fulfilled_amount then
    return new;
  end if;

  perform public.notify_users(
    'chip_donated',
    array[new.requested_by],
    'Chips Received!',
    'Someone donated ' || (new.fulfilled_amount - old.fulfilled_amount) || ' chips to your request!',
    jsonb_build_object('room_id', new.room_id, 'chip_request_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists on_chip_donated on public.chip_requests;
create trigger on_chip_donated
after update on public.chip_requests
for each row
execute function public.trigger_chip_donated();
