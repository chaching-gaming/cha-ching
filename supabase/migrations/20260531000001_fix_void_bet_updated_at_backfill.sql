-- Fix updated_at backfill for VOID bets
-- ============================================================
--
-- Problem: Previous migration set updated_at = now() for all existing bets,
-- but VOID bets should have updated_at set to when they were actually voided.
--
-- Solution:
-- 1. For VOID bets with bet_void_logs entry: use bet_void_logs.created_at
-- 2. For VOID bets without logs (auto-voided): use bets.created_at as fallback
-- 3. Delete all stale VOID bets after fixing timestamps

-- ============================================================
-- 1. Fix updated_at for VOID bets that have void logs (admin-voided)
-- ============================================================

UPDATE public.bets b
SET updated_at = vl.created_at
FROM public.bet_void_logs vl
WHERE b.id = vl.bet_id
  AND b.status = 'VOID';

-- ============================================================
-- 2. Fix updated_at for VOID bets without void logs (auto-voided)
-- Use created_at as fallback (these are old and should be deleted anyway)
-- ============================================================

UPDATE public.bets
SET updated_at = created_at
WHERE status = 'VOID'
  AND id NOT IN (SELECT bet_id FROM public.bet_void_logs);

-- ============================================================
-- 3. Now delete all stale VOID bets (older than 5 minutes)
-- ============================================================

DELETE FROM public.bets
WHERE status = 'VOID'
  AND updated_at < now() - interval '5 minutes';
