-- Settlement Windows Schema Changes
--
-- Redesign bet settlement to use timed windows and majority voting.
--
-- New flow:
-- BET EXPIRES → PENDING_RESULT (outcome window opens)
--   → Zero submissions → VOID
--   → Majority winner → PENDING_DISPUTE (dispute window opens)
--   → Tie → DISPUTED
-- PENDING_DISPUTE:
--   → Participant raises dispute → DISPUTED
--   → No dispute after window → SETTLED

-- ============================================================
-- 1. Add room configuration for outcome submission window
-- ============================================================

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS outcome_submission_window_seconds INT NOT NULL DEFAULT 30
    CHECK (outcome_submission_window_seconds >= 10 AND outcome_submission_window_seconds <= 300);

-- ============================================================
-- 2. Add PENDING_DISPUTE status to bets constraint
-- ============================================================

ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_status_check;
ALTER TABLE public.bets ADD CONSTRAINT bets_status_check CHECK (
  status IN ('OPEN','MATCHED','PENDING_RESULT','PENDING_DISPUTE','DISPUTED','SETTLED','EXPIRED','VOID')
);

-- ============================================================
-- 3. Add window tracking columns to bets
-- ============================================================

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS outcome_window_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_window_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS preliminary_outcome TEXT;

-- ============================================================
-- 4. Add indexes for cron efficiency
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bets_outcome_window ON public.bets(outcome_window_ends_at) WHERE status = 'PENDING_RESULT';
CREATE INDEX IF NOT EXISTS idx_bets_dispute_window ON public.bets(dispute_window_ends_at) WHERE status = 'PENDING_DISPUTE';
