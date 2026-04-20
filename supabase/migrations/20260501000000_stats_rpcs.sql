-- Stats Dashboard RPCs (mini-tasks 1 & 2):
--   * get_room_player_stats — per-member W/L, net chips, per-template breakdown
--   * get_room_event_stats  — room totals, status breakdown, popular templates
--
-- Both are `security definer` + gated by `is_room_member(p_room_id)` so they
-- can read `ledger_entries` (self-scoped RLS) across users. Scoped per room;
-- no global leaderboard view. Callers are always authenticated.
--
-- `bets.template_id` is stored as text (historical reasons); we cast it to
-- uuid in joins so the `question_templates` PK index is used.

-- ============================================================
-- 1. get_room_player_stats
-- ============================================================

create or replace function public.get_room_player_stats(p_room_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  balance numeric,
  wins int,
  losses int,
  category_breakdown jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  with per_user as (
    select
      rm.user_id,
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
    group by rm.user_id
  ),
  -- Per-(user, template) bet outcomes. One row per bet the user staked in
  -- with its final status and whether they won.
  per_user_bet as (
    select distinct on (le.user_id, le.bet_id)
      le.user_id,
      le.bet_id,
      b.status,
      b.template_id,
      exists (
        select 1 from public.ledger_entries lew
        where lew.bet_id = le.bet_id and lew.user_id = le.user_id and lew.type = 'BET_WIN'
      ) as won
    from public.ledger_entries le
    join public.bets b on b.id = le.bet_id
    where le.room_id = p_room_id
      and le.type = 'BET_LOSS'
      and b.status = 'SETTLED'
  ),
  per_user_category as (
    select
      pub.user_id,
      qt.slug as template_slug,
      qt.short_label as template_label,
      count(*)::int as bets,
      sum(case when pub.won then 1 else 0 end)::int as wins,
      sum(case when pub.won then 0 else 1 end)::int as losses
    from per_user_bet pub
    left join public.question_templates qt
      on pub.template_id is not null and qt.id = pub.template_id::uuid
    group by pub.user_id, qt.slug, qt.short_label
  ),
  per_user_agg_breakdown as (
    select
      puc.user_id,
      jsonb_agg(
        jsonb_build_object(
          'template_slug', puc.template_slug,
          'template_label', coalesce(puc.template_label, 'Write-in'),
          'bets', puc.bets,
          'wins', puc.wins,
          'losses', puc.losses
        )
        order by puc.bets desc, coalesce(puc.template_label, 'Write-in') asc
      ) as category_breakdown
    from per_user_category puc
    group by puc.user_id
  )
  select
    pu.user_id,
    p.display_name,
    p.avatar_url,
    pu.balance,
    pu.wins,
    greatest(pu.stakes_in_settled - pu.wins, 0)::int as losses,
    coalesce(ab.category_breakdown, '[]'::jsonb) as category_breakdown
  from per_user pu
  join public.profiles p on p.id = pu.user_id
  left join per_user_agg_breakdown ab on ab.user_id = pu.user_id
  order by pu.balance desc, p.display_name asc;
$$;

revoke all on function public.get_room_player_stats(uuid) from public;
grant execute on function public.get_room_player_stats(uuid) to authenticated;

-- ============================================================
-- 2. get_room_event_stats
-- ============================================================

create or replace function public.get_room_event_stats(p_room_id uuid)
returns table (
  total_bets int,
  open_bets int,
  matched_bets int,
  settled_bets int,
  voided_bets int,
  total_chips_wagered numeric,
  total_donations numeric,
  total_members int,
  popular_templates jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  with bet_counts as (
    select
      count(*)::int as total_bets,
      count(*) filter (where status = 'OPEN')::int as open_bets,
      count(*) filter (where status in ('MATCHED', 'PENDING_RESULT', 'DISPUTED'))::int as matched_bets,
      count(*) filter (where status = 'SETTLED')::int as settled_bets,
      count(*) filter (where status = 'VOID')::int as voided_bets
    from public.bets
    where room_id = p_room_id
  ),
  chip_flows as (
    select
      coalesce(sum(abs(amount)) filter (where type = 'BET_LOSS'), 0)::numeric as total_chips_wagered,
      coalesce(sum(amount) filter (where type = 'DONATION_IN'), 0)::numeric as total_donations
    from public.ledger_entries
    where room_id = p_room_id
  ),
  member_count as (
    select count(*)::int as total_members
    from public.room_members
    where room_id = p_room_id
  ),
  template_counts as (
    -- Top 5 templates by bet count, alphabetical tiebreak. Write-in bets
    -- (template_id is null) fold into a single `Write-in` bucket.
    select
      coalesce(qt.slug, null) as template_slug,
      coalesce(qt.short_label, 'Write-in') as label,
      count(*)::int as bet_count
    from public.bets b
    left join public.question_templates qt
      on b.template_id is not null and qt.id = b.template_id::uuid
    where b.room_id = p_room_id
    group by qt.slug, qt.short_label
    order by bet_count desc, label asc
    limit 5
  ),
  templates_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'template_slug', template_slug,
          'label', label,
          'bet_count', bet_count
        )
      ),
      '[]'::jsonb
    ) as popular_templates
    from template_counts
  )
  select
    bc.total_bets,
    bc.open_bets,
    bc.matched_bets,
    bc.settled_bets,
    bc.voided_bets,
    cf.total_chips_wagered,
    cf.total_donations,
    mc.total_members,
    tj.popular_templates
  from bet_counts bc
  cross join chip_flows cf
  cross join member_count mc
  cross join templates_json tj
  where public.is_room_member(p_room_id);
$$;

revoke all on function public.get_room_event_stats(uuid) from public;
grant execute on function public.get_room_event_stats(uuid) to authenticated;
