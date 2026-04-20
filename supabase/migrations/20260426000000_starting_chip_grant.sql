-- Every room member starts with 1000 chips (FR follow-up to chip standings).
--   * Implemented as a ledger_entries row of type 'GRANT', amount = 1000, so
--     every balance path that sums the ledger (get_my_room_balance,
--     get_room_member_balances, join_bet loss-floor check) picks it up
--     automatically — no branching math elsewhere.
--   * AFTER INSERT trigger on room_members fires the grant so any future code
--     path that adds members gets the starting balance for free.
--   * A partial unique index makes the grant idempotent per (room, user):
--     if a member is removed and re-added, no second grant fires — their
--     prior ledger history remains and the existing GRANT stays in place.

-- ============================================================
-- 1. Extend ledger_entries.type check to include 'GRANT'
-- ============================================================

alter table public.ledger_entries drop constraint ledger_entries_type_check;
alter table public.ledger_entries
  add constraint ledger_entries_type_check
    check (type in ('BET', 'DONATION', 'WIN', 'REFUND', 'GRANT'));

-- Idempotency guard: one GRANT per (room, user).
create unique index if not exists ledger_entries_one_grant_per_member_idx
  on public.ledger_entries (room_id, user_id)
  where type = 'GRANT';

-- ============================================================
-- 2. Trigger — grant 1000 on room_members INSERT
-- ============================================================

create or replace function public.grant_starting_chips()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ledger_entries (room_id, user_id, type, amount)
  values (new.room_id, new.user_id, 'GRANT', 1000)
  on conflict (room_id, user_id) where type = 'GRANT' do nothing;
  return new;
end;
$$;

drop trigger if exists room_members_grant_starting_chips on public.room_members;
create trigger room_members_grant_starting_chips
  after insert on public.room_members
  for each row
  execute function public.grant_starting_chips();

-- ============================================================
-- 3. Backfill existing members
-- ============================================================

insert into public.ledger_entries (room_id, user_id, type, amount)
select rm.room_id, rm.user_id, 'GRANT', 1000
  from public.room_members rm
 where not exists (
   select 1 from public.ledger_entries le
    where le.room_id = rm.room_id
      and le.user_id = rm.user_id
      and le.type = 'GRANT'
 );
