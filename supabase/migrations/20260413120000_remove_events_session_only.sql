-- Session-only model: bets scoped to rooms; remove events layer.

-- 1. Align room_id with parent event when they differ (covers null room_id).
update public.bets b
set room_id = e.room_id
from public.events e
where b.event_id = e.id
  and b.room_id is distinct from e.room_id;

-- 2. Every bet must belong to a room before we drop event_id and enforce NOT NULL.
do $$
begin
  if exists (select 1 from public.bets where room_id is null) then
    raise exception 'Migration remove_events_session_only: bets still have null room_id after backfill from events';
  end if;
end $$;

alter table public.bets alter column room_id set not null;

-- 3. Remove event linkage and events table (RLS, idx_events_room go with the table).
alter table public.bets drop column if exists event_id;

drop table if exists public.events cascade;

-- Future bet RPCs (create_bet, accept_bet, settle_bet): take room_id only; authorize via room_members / is_room_member.
