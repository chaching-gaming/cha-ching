-- Member settlements: track settlement status for each member's net balance
-- Settlement statuses: PENDING (amber), SETTLED (green), DISPUTED (red)

-- 1. Create member_settlements table
create table public.member_settlements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'SETTLED', 'DISPUTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id)
);

-- Index for fast lookups
create index idx_member_settlements_room on public.member_settlements(room_id);

-- 2. RLS policies
alter table public.member_settlements enable row level security;

-- Members can view settlement statuses in their rooms
create policy "Members can view settlement statuses"
  on public.member_settlements for select
  using (public.is_room_member(room_id));

-- Admins can insert/update settlement statuses
create policy "Admins can manage settlement statuses"
  on public.member_settlements for all
  using (public.is_room_admin(room_id))
  with check (public.is_room_admin(room_id));

-- 3. Updated trigger for updated_at
create or replace function public.update_member_settlements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_member_settlements_updated_at
  before update on public.member_settlements
  for each row execute function public.update_member_settlements_updated_at();

-- 4. Update get_room_member_balances to return net_balance, settlement_status, and left_at
drop function if exists public.get_room_member_balances(uuid);

create or replace function public.get_room_member_balances(p_room_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  balance numeric,
  wins int,
  losses int,
  net_balance numeric,
  settlement_status text,
  left_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with member_stats as (
    select
      rm.user_id,
      rm.left_at,
      coalesce(sum(le.amount), 0)::numeric as balance,
      count(distinct case when le.type = 'BET_WIN' then le.bet_id end)::int as wins,
      count(distinct case
        when le.type = 'BET_LOSS' and b.status = 'SETTLED' then le.bet_id
      end)::int as stakes_in_settled
    from public.room_members rm
    left join public.ledger_entries le
      on le.room_id = rm.room_id and le.user_id = rm.user_id
    left join public.bets b on b.id = le.bet_id
    where rm.room_id = p_room_id
      and public.is_room_member(p_room_id)
    group by rm.user_id, rm.left_at
  ),
  room_info as (
    select starting_chips from public.rooms where id = p_room_id
  )
  select
    ms.user_id,
    p.display_name,
    p.avatar_url,
    ms.balance,
    ms.wins,
    greatest(ms.stakes_in_settled - ms.wins, 0)::int as losses,
    (ms.balance - ri.starting_chips)::numeric as net_balance,
    s.status as settlement_status,
    ms.left_at
  from member_stats ms
  join public.profiles p on p.id = ms.user_id
  cross join room_info ri
  left join public.member_settlements s
    on s.room_id = p_room_id and s.user_id = ms.user_id
  order by ms.balance desc, p.display_name asc;
$$;

revoke all on function public.get_room_member_balances(uuid) from public;
grant execute on function public.get_room_member_balances(uuid) to authenticated;

-- 5. Create update_settlement_status RPC (admin-only, upserts status)
create or replace function public.update_settlement_status(
  p_room_id uuid,
  p_user_id uuid,
  p_status text
)
returns public.member_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.member_settlements;
begin
  -- Verify caller is admin
  if not public.is_room_admin(p_room_id) then
    raise exception 'Only room admins can update settlement status';
  end if;

  -- Validate status
  if p_status not in ('PENDING', 'SETTLED', 'DISPUTED') then
    raise exception 'Invalid status: must be PENDING, SETTLED, or DISPUTED';
  end if;

  -- Upsert the settlement status
  insert into public.member_settlements (room_id, user_id, status)
  values (p_room_id, p_user_id, p_status)
  on conflict (room_id, user_id)
  do update set status = p_status, updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.update_settlement_status(uuid, uuid, text) from public;
grant execute on function public.update_settlement_status(uuid, uuid, text) to authenticated;

-- 6. Backfill existing non-zero balances as PENDING
-- For each room, find members with non-zero net balance and create PENDING records
insert into public.member_settlements (room_id, user_id, status)
select distinct
  rm.room_id,
  rm.user_id,
  'PENDING'
from public.room_members rm
join public.rooms r on r.id = rm.room_id
where (
  select coalesce(sum(le.amount), 0)
  from public.ledger_entries le
  where le.room_id = rm.room_id and le.user_id = rm.user_id
) != r.starting_chips
on conflict (room_id, user_id) do nothing;

-- 7. Enable realtime on member_settlements
alter publication supabase_realtime add table public.member_settlements;
