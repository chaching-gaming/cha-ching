-- Admin ledger screen + CSV exports:
--   * get_room_ledger  — paginated admin-only ledger reader; joins profile
--     display + bet question. Used by the ledger screen (100/page) and by the
--     CSV export (p_limit up to 10000). Gated via is_room_admin in the final
--     where clause, matching get_room_player_stats: non-admins get an empty
--     result set rather than an exception.
--   * export_room_bets — flattened bet rows for CSV with joined display
--     names (offerer / acceptor / subject / winner) and latest-void audit
--     metadata. Same gate.
--
-- Both are security definer / stable so they can read ledger_entries
-- (self-scoped RLS) and bet_void_logs (admin-scoped RLS) across users.

-- ============================================================
-- 1. get_room_ledger
-- ============================================================

create or replace function public.get_room_ledger(
  p_room_id uuid,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  type text,
  amount numeric,
  bet_id uuid,
  bet_question text,
  chip_request_id uuid,
  created_at timestamp
)
language sql
security definer
set search_path = public
stable
as $$
  select
    le.id,
    le.user_id,
    p.display_name,
    p.avatar_url,
    le.type,
    le.amount,
    le.bet_id,
    b.question as bet_question,
    le.chip_request_id,
    le.created_at
  from public.ledger_entries le
  join public.profiles p on p.id = le.user_id
  left join public.bets b on b.id = le.bet_id
  where le.room_id = p_room_id
    and public.is_room_admin(p_room_id)
  order by le.created_at desc, le.id desc
  limit least(greatest(p_limit, 0), 10000)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_room_ledger(uuid, int, int) from public;
grant execute on function public.get_room_ledger(uuid, int, int) to authenticated;

-- ============================================================
-- 2. export_room_bets
-- ============================================================

create or replace function public.export_room_bets(p_room_id uuid)
returns table (
  id uuid,
  created_at timestamp,
  settled_at timestamp,
  status text,
  question text,
  options jsonb,
  stake int,
  offered_by uuid,
  offered_by_name text,
  offered_pick text,
  accepted_by uuid,
  accepted_by_name text,
  accepted_pick text,
  subject_user_id uuid,
  subject_user_name text,
  subject_positive_option text,
  outcome text,
  winner uuid,
  winner_name text,
  settlement_method text,
  voided_at timestamptz,
  voided_by uuid,
  voided_by_name text,
  void_reason text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    b.id,
    b.created_at,
    b.settled_at,
    b.status,
    b.question,
    b.options,
    b.stake,
    b.offered_by,
    off_p.display_name as offered_by_name,
    b.offered_pick,
    b.accepted_by,
    acc_p.display_name as accepted_by_name,
    b.accepted_pick,
    b.subject_user_id,
    sub_p.display_name as subject_user_name,
    b.subject_positive_option,
    b.outcome,
    b.winner,
    win_p.display_name as winner_name,
    b.settlement_method,
    vl.created_at as voided_at,
    vl.voided_by,
    void_p.display_name as voided_by_name,
    vl.reason as void_reason
  from public.bets b
  left join public.profiles off_p on off_p.id = b.offered_by
  left join public.profiles acc_p on acc_p.id = b.accepted_by
  left join public.profiles sub_p on sub_p.id = b.subject_user_id
  left join public.profiles win_p on win_p.id = b.winner
  -- Latest void log row per bet (there is normally at most one).
  left join lateral (
    select *
    from public.bet_void_logs vl2
    where vl2.bet_id = b.id
    order by vl2.created_at desc
    limit 1
  ) vl on true
  left join public.profiles void_p on void_p.id = vl.voided_by
  where b.room_id = p_room_id
    and public.is_room_admin(p_room_id)
  order by b.created_at desc, b.id desc;
$$;

revoke all on function public.export_room_bets(uuid) from public;
grant execute on function public.export_room_bets(uuid) to authenticated;
