-- Admin void system:
--   * is_room_admin(p_room_id) — admin-only sibling of is_room_attestor
--   * bet_void_logs — audit trail for admin void actions
--   * void_bet(p_bet_id, p_reason) — admin-only, refunds every participant
--     by inserting a single net-inverse REFUND per user, flips status to VOID,
--     writes an audit row. Works for any non-VOID status: for OPEN/MATCHED/
--     DISPUTED the per-user net is -stake, so the inverse is +stake; for
--     SETTLED the winner's net is +stake (BET -stake plus WIN 2*stake) and
--     losers' net is -stake — the inverse zeros each participant's position
--     on the bet.
--
-- Realtime: bets is already published (20260411060000_enable_realtime_and_balance);
-- the UPDATE that flips status to VOID is broadcast to clients automatically.

-- ============================================================
-- 1. is_room_admin helper
-- ============================================================

create or replace function public.is_room_admin(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.room_members
    where room_id = p_room_id
      and user_id = auth.uid()
      and role = 'ADMIN'
  );
$$;

-- ============================================================
-- 2. bet_void_logs audit table
-- ============================================================

create table if not exists public.bet_void_logs (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  voided_by uuid not null references public.profiles(id),
  previous_status text not null,
  reason text,
  refund_total int not null default 0,
  affected_user_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists bet_void_logs_bet_id_idx
  on public.bet_void_logs (bet_id);
create index if not exists bet_void_logs_room_created_at_idx
  on public.bet_void_logs (room_id, created_at desc);

alter table public.bet_void_logs enable row level security;

-- Room admins can read their room's void log. Writes happen exclusively
-- through void_bet(); no insert/update/delete policies so RLS denies by default.
create policy "Room admins can view void logs"
on public.bet_void_logs for select
using (public.is_room_admin(room_id));

-- ============================================================
-- 3. void_bet RPC
-- ============================================================

create or replace function public.void_bet(p_bet_id uuid, p_reason text default null)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_prev_status text;
  v_refund_total int := 0;
  v_affected_count int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0501';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0502';
  end if;

  if not public.is_room_admin(v_bet.room_id) then
    raise exception 'Only an admin can void bets' using errcode = 'P0503';
  end if;

  if v_bet.status = 'VOID' then
    raise exception 'Bet is already voided' using errcode = 'P0504';
  end if;

  v_prev_status := v_bet.status;

  -- Insert one REFUND per user whose ledger for this bet is non-zero,
  -- with amount = -(their net). Zeroes their position on the bet regardless
  -- of whether chips were debited (BET), credited (WIN), or mixed.
  with reversals as (
    insert into public.ledger_entries (room_id, type, bet_id, user_id, amount)
    select v_bet.room_id, 'REFUND', v_bet.id, le.user_id, -sum(le.amount)
      from public.ledger_entries le
     where le.bet_id = p_bet_id
     group by le.user_id
    having sum(le.amount) <> 0
    returning user_id, amount
  )
  select coalesce(sum(abs(amount)), 0)::int, count(*)::int
    into v_refund_total, v_affected_count
    from reversals;

  update public.bets
     set status = 'VOID'
   where id = p_bet_id
  returning * into v_bet;

  insert into public.bet_void_logs
    (bet_id, room_id, voided_by, previous_status, reason, refund_total, affected_user_count)
  values
    (v_bet.id, v_bet.room_id, auth.uid(), v_prev_status,
     nullif(trim(p_reason), ''), v_refund_total, v_affected_count);

  return v_bet;
end;
$$;

revoke all on function public.void_bet(uuid, text) from public;
grant execute on function public.void_bet(uuid, text) to authenticated;
