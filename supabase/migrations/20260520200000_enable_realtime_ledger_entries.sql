-- Enable Realtime on ledger_entries for live balance updates.
-- This ensures balance changes propagate in realtime when donations occur.

alter publication supabase_realtime add table public.ledger_entries;
