-- Composite (room_id, user_id) index on ledger_entries.
-- The standings RPC runs `sum(amount) ... group by user_id where room_id = ?`;
-- with only separate (room_id) and (user_id) indexes today, the planner scans
-- by room_id then aggregates. A full composite lets Postgres do an index-only
-- scan for hot rooms and keeps per-member lookups fast as history grows.
--
-- The existing partial indexes stay (they target GRANT idempotency and
-- donation lookups by chip_request_id respectively).

create index if not exists ledger_entries_room_user_idx
  on public.ledger_entries (room_id, user_id);
