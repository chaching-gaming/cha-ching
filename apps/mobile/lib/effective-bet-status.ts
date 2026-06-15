import { differenceInSeconds } from 'date-fns';

import { parseApiTimestamp } from '@/lib/date-format';

/** True when the row is still `OPEN` or `MATCHED` in the DB but the offer window has ended. */
export function isBetPastExpiry(
  status: string | null | undefined,
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== 'OPEN' && status !== 'MATCHED') return false;
  const end = parseApiTimestamp(expiresAt ?? null);
  if (!end) return false;
  return differenceInSeconds(end, now) <= 0;
}

/** @deprecated Use isBetPastExpiry instead */
export function isOpenBetPastExpiry(
  status: string | null | undefined,
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return isBetPastExpiry(status, expiresAt, now);
}

/**
 * Check if a bet has stakes on both sides (is matched).
 * Requires bet.stakes array with pick field.
 */
function isBetMatched(stakes: Array<{ pick: string }> | undefined): boolean {
  if (!stakes || stakes.length < 2) {
    return false;
  }
  const distinctPicks = new Set(stakes.map((s) => s.pick.trim().toLowerCase()));
  return distinctPicks.size >= 2;
}

/**
 * Status for UI and filters: past-deadline open offers show effective status:
 * - PENDING_RESULT if both sides staked (bet was matched)
 * - EXPIRED if only one side staked (bet was not matched)
 */
export function getEffectiveBetStatus(
  bet: {
    status: string | null | undefined;
    expires_at: string | null | undefined;
    stakes?: Array<{ pick: string }>;
  },
  now: Date = new Date(),
): string {
  if (isOpenBetPastExpiry(bet.status, bet.expires_at, now)) {
    // Check if bet has both sides staked
    if (isBetMatched(bet.stakes)) {
      return 'PENDING_RESULT';
    }
    return 'EXPIRED';
  }
  return bet.status ?? '';
}

/**
 * Check if a bet is awaiting outcome submissions.
 * With indefinite outcome windows, this returns true when status is PENDING_RESULT.
 *
 * @deprecated Outcome windows are now indefinite. Use bet.status === 'PENDING_RESULT' directly.
 */
export function hasOutcomeWindowSet(bet: {
  status: string | null | undefined;
  outcome_window_ends_at?: string | null;
  expires_at?: string | null;
}): boolean {
  // Outcome windows are now indefinite - a bet in PENDING_RESULT is always awaiting submissions
  if (bet.status === 'PENDING_RESULT') return true;

  // If bet is expired OPEN/MATCHED (effective PENDING_RESULT)
  if (isBetPastExpiry(bet.status, bet.expires_at)) return true;

  return false;
}

/**
 * Check if a bet is in the outcome submission window.
 * With indefinite outcome windows, returns true for any PENDING_RESULT bet.
 */
export function isInOutcomeWindow(
  bet: {
    status: string | null | undefined;
    outcome_window_ends_at?: string | null;
  },
  _now: Date = new Date(),
): boolean {
  // Outcome windows are now indefinite - always in window if PENDING_RESULT
  return bet.status === 'PENDING_RESULT';
}

/**
 * Check if the dispute window is properly configured (not NULL).
 * Returns false if the bet is PENDING_DISPUTE but dispute_window_ends_at is not set.
 */
export function hasDisputeWindowSet(bet: {
  status: string | null | undefined;
  dispute_window_ends_at?: string | null;
}): boolean {
  if (bet.status !== 'PENDING_DISPUTE') return false;
  return bet.dispute_window_ends_at != null;
}

/**
 * Check if a bet is in the dispute window.
 * Returns true if status is PENDING_DISPUTE and dispute_window_ends_at is in the future.
 */
export function isInDisputeWindow(
  bet: {
    status: string | null | undefined;
    dispute_window_ends_at?: string | null;
  },
  now: Date = new Date(),
): boolean {
  if (bet.status !== 'PENDING_DISPUTE') return false;
  if (!bet.dispute_window_ends_at) return false;
  const windowEnd = parseApiTimestamp(bet.dispute_window_ends_at);
  if (!windowEnd) return false;
  return differenceInSeconds(windowEnd, now) > 0;
}

/**
 * Get the remaining seconds in the outcome window.
 * With indefinite outcome windows, returns Infinity for PENDING_RESULT bets.
 *
 * Note: Outcome windows are now indefinite. Bets stay in PENDING_RESULT until
 * all participants submit or an admin resolves/voids the bet.
 *
 * @param bet The bet object
 * @param _windowSeconds Deprecated - no longer used (windows are indefinite)
 * @param now Current time for calculation
 */
export function getOutcomeWindowRemaining(
  bet: {
    status: string | null | undefined;
    outcome_window_ends_at?: string | null;
    expires_at?: string | null;
  },
  _windowSeconds: number = 30,
  now: Date = new Date(),
): number {
  // Outcome windows are now indefinite

  // If PENDING_RESULT, window is indefinite
  if (bet.status === 'PENDING_RESULT') {
    return Infinity;
  }

  // If expired OPEN/MATCHED bet (effective PENDING_RESULT), window is indefinite
  if (isBetPastExpiry(bet.status, bet.expires_at, now)) {
    return Infinity;
  }

  return 0;
}

/**
 * Get the remaining seconds in the dispute window.
 * Returns 0 if not in dispute window or window has expired.
 */
export function getDisputeWindowRemaining(
  bet: {
    status: string | null | undefined;
    dispute_window_ends_at?: string | null;
  },
  now: Date = new Date(),
): number {
  if (bet.status !== 'PENDING_DISPUTE') return 0;
  if (!bet.dispute_window_ends_at) return 0;
  const windowEnd = parseApiTimestamp(bet.dispute_window_ends_at);
  if (!windowEnd) return 0;
  const remaining = differenceInSeconds(windowEnd, now);
  return remaining > 0 ? remaining : 0;
}
