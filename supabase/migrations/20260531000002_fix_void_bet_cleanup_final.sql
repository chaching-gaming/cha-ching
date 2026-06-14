-- Fix void bet cleanup - disable trigger during backfill
-- ============================================================
--
-- Problem: The bets_set_updated_at trigger overwrites updated_at on every UPDATE,
-- so our backfill values get replaced with now().
--
-- Solution: Disable trigger, fix timestamps, delete stale voids, re-enable trigger

-- ============================================================
-- 1. Disable the trigger temporarily
-- ============================================================

ALTER TABLE public.bets DISABLE TRIGGER bets_set_updated_at;

-- ============================================================
-- 2. Fix updated_at for VOID bets that have void logs (admin-voided)
-- ============================================================

UPDATE public.bets b
SET updated_at = vl.created_at
FROM public.bet_void_logs vl
WHERE b.id = vl.bet_id
  AND b.status = 'VOID';

-- ============================================================
-- 3. Fix updated_at for VOID bets without void logs (auto-voided)
-- Use created_at as fallback
-- ============================================================

UPDATE public.bets
SET updated_at = created_at
WHERE status = 'VOID'
  AND id NOT IN (SELECT bet_id FROM public.bet_void_logs);

-- ============================================================
-- 4. Re-enable the trigger
-- ============================================================

ALTER TABLE public.bets ENABLE TRIGGER bets_set_updated_at;

-- ============================================================
-- 5. Now delete all stale VOID bets (older than 5 minutes)
-- ============================================================

DELETE FROM public.bets
WHERE status = 'VOID'
  AND updated_at < now() - interval '5 minutes';
