-- Per-room member balances (FR-8.2):
--   * All room members see a running net chip total for every other member.
--   * `ledger_entries` RLS is strictly self-scoped, so callers cannot read
--     other users' rows directly. This RPC is `security definer` and bypasses
--     that RLS intentionally, gated by an `is_room_member` check so only
--     room members can probe.
--   * Ordering is leaderboard-style (highest balance first, name as tiebreak).
--   * Rounding to the nearest 100 is applied client-side to keep the source
--     value precise for any future use.

create or replace function public.get_room_member_balances(p_room_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  balance numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    rm.user_id,
    p.display_name,
    p.avatar_url,
    coalesce(sum(le.amount), 0)::numeric as balance
  from public.room_members rm
  join public.profiles p on p.id = rm.user_id
  left join public.ledger_entries le
    on le.room_id = rm.room_id and le.user_id = rm.user_id
  where rm.room_id = p_room_id
    and public.is_room_member(p_room_id)
  group by rm.user_id, p.display_name, p.avatar_url
  order by balance desc, p.display_name asc;
$$;

revoke all on function public.get_room_member_balances(uuid) from public;
grant execute on function public.get_room_member_balances(uuid) to authenticated;
