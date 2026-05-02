-- Add bet_accepted notification type:
--   * Notifies bet offerer when someone joins/accepts their bet
--   * Trigger fires on bet_stakes INSERT

-- ============================================================
-- 1. Update notifications type constraint
-- ============================================================

alter table public.notifications
drop constraint if exists notifications_type_check;

alter table public.notifications
add constraint notifications_type_check check (type in (
  'bet_matched',
  'bet_settled',
  'bet_disputed',
  'bet_expiring',
  'chip_request_created',
  'chip_donated',
  'bet_accepted'
));

-- ============================================================
-- 2. Trigger: on_bet_accepted
-- ============================================================
-- When someone joins a bet, notify the original offerer.
-- This is separate from bet_matched (which fires when 2+ sides exist).

create or replace function public.trigger_bet_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_acceptor_name text;
begin
  -- Get the bet details
  select * into v_bet from public.bets where id = new.bet_id;

  if v_bet is null then
    return new;
  end if;

  -- Don't notify if the joiner is the offerer (creator joining own bet)
  if v_bet.offered_by is not distinct from new.user_id then
    return new;
  end if;

  -- Get the acceptor's display name
  select display_name into v_acceptor_name
  from public.profiles
  where id = new.user_id;

  -- Notify the bet offerer
  perform public.notify_users(
    'bet_accepted',
    array[v_bet.offered_by],
    'Bet Accepted!',
    coalesce(v_acceptor_name, 'Someone') || ' joined your bet: "' || left(v_bet.question, 50) || '"',
    jsonb_build_object('room_id', v_bet.room_id, 'bet_id', v_bet.id)
  );

  return new;
end;
$$;

drop trigger if exists on_bet_accepted on public.bet_stakes;
create trigger on_bet_accepted
after insert on public.bet_stakes
for each row
execute function public.trigger_bet_accepted();
