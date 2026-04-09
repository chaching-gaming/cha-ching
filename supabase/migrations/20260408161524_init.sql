-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  email text,
  created_at timestamp default now()
);

alter table public.profiles enable row level security;

create policy "Users can view all profiles"
on public.profiles for select
using (true);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id);

-- Rooms
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  invite_code text unique not null,
  created_by uuid references public.profiles(id),
  chip_limit int,
  status text default 'ACTIVE',
  created_at timestamp default now()
);

create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text check (role in ('PLAYER', 'ATTESTOR', 'ADMIN')),
  joined_at timestamp default now(),
  unique(room_id, user_id)
);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

create policy "Members can view rooms"
on public.rooms for select
using (
  exists (
    select 1 from public.room_members rm
    where rm.room_id = rooms.id
    and rm.user_id = auth.uid()
  )
);

create policy "View room members"
on public.room_members for select
using (
  exists (
    select 1 from public.room_members rm
    where rm.room_id = room_members.room_id
    and rm.user_id = auth.uid()
  )
);

-- Events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  name text not null,
  sport text,
  status text check (status in ('UPCOMING', 'LIVE', 'COMPLETED')),
  created_by uuid references public.profiles(id),
  event_date timestamp,
  created_at timestamp default now()
);

alter table public.events enable row level security;

create policy "Room members can view events"
on public.events for select
using (
  exists (
    select 1 from public.room_members rm
    where rm.room_id = events.room_id
    and rm.user_id = auth.uid()
  )
);

-- Bets
create table public.bets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id),
  room_id uuid references public.rooms(id),
  question text not null,
  options jsonb not null,
  template_id text,
  stake int not null,

  offered_by uuid references public.profiles(id),
  offered_pick text,

  accepted_by uuid references public.profiles(id),
  accepted_pick text,

  status text check (
    status in ('OPEN','MATCHED','PENDING_RESULT','DISPUTED','SETTLED','EXPIRED','VOID')
  ) default 'OPEN',

  expires_at timestamp,
  created_at timestamp default now(),
  settled_at timestamp,

  outcome text,
  winner uuid references public.profiles(id),
  settlement_method text
);

alter table public.bets enable row level security;

create policy "Room members can view bets"
on public.bets for select
using (
  exists (
    select 1 from public.room_members rm
    where rm.room_id = bets.room_id
    and rm.user_id = auth.uid()
  )
);

-- Outcome Submissions
create table public.outcome_submissions (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid references public.bets(id) on delete cascade,
  user_id uuid references public.profiles(id),
  selected_option text not null,
  submitted_at timestamp default now(),
  unique(bet_id, user_id)
);

alter table public.outcome_submissions enable row level security;

create policy "Participants can submit outcomes"
on public.outcome_submissions for insert
with check (
  exists (
    select 1 from public.bets b
    where b.id = bet_id
    and (b.offered_by = auth.uid() or b.accepted_by = auth.uid())
  )
);

-- Ledger Entries
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id),
  type text check (type in ('BET','DONATION')),
  bet_id uuid references public.bets(id),
  user_id uuid references public.profiles(id),
  amount numeric not null,
  created_at timestamp default now()
);

alter table public.ledger_entries enable row level security;

create policy "Users can view their ledger"
on public.ledger_entries for select
using (
  user_id = auth.uid()
);

-- Chip Requests
create table public.chip_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id),
  requested_by uuid references public.profiles(id),
  current_balance numeric,
  status text check (status in ('OPEN','FULFILLED','EXPIRED')) default 'OPEN',
  created_at timestamp default now()
);

alter table public.chip_requests enable row level security;

create policy "Room members can view chip requests"
on public.chip_requests for select
using (
  exists (
    select 1 from public.room_members rm
    where rm.room_id = chip_requests.room_id
    and rm.user_id = auth.uid()
  )
);

-- Indexes
create index idx_room_members_user on public.room_members(user_id);
create index idx_room_members_room on public.room_members(room_id);
create index idx_events_room on public.events(room_id);
create index idx_bets_room on public.bets(room_id);
create index idx_bets_status on public.bets(status);
create index idx_outcome_bet on public.outcome_submissions(bet_id);
create index idx_ledger_user on public.ledger_entries(user_id);
create index idx_ledger_room on public.ledger_entries(room_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'New User'),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

-- Grants
grant usage on schema public to service_role;
grant insert on table public.profiles to service_role;
