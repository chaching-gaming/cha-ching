-- Add index on ledger_entries.bet_id for faster queries and realtime filtering
-- This improves performance of:
--   1. The realtime subscription filter `bet_id=eq.${id}`
--   2. Queries that join or filter by bet_id
--   3. The void_bet function's SUM aggregation by bet_id

create index if not exists ledger_entries_bet_id_idx
  on public.ledger_entries (bet_id)
  where bet_id is not null;
