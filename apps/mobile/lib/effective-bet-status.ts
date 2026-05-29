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
    console.log('[isBetMatched] Returning false - stakes length:', stakes?.length ?? 0);
    return false;
  }
  const distinctPicks = new Set(stakes.map((s) => s.pick.trim().toLowerCase()));
  const result = distinctPicks.size >= 2;
  if (!result) {
    console.log('[isBetMatched] Returning false - distinctPicks:', distinctPicks.size, 'picks:', Array.from(distinctPicks));
  }
  return result;
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
 * Check if the outcome window can be determined.
 * Returns true if:
 * - outcome_window_ends_at is explicitly set, OR
 * - The bet is PENDING_RESULT (or effective PENDING_RESULT) and has expires_at,
 *   allowing client-side calculation based on expires_at + window.
 */
export function hasOutcomeWindowSet(bet: {
  status: string | null | undefined;
  outcome_window_ends_at?: string | null;
  expires_at?: string | null;
}): boolean {
  // If outcome_window_ends_at is set, window is known
  if (bet.outcome_window_ends_at != null) return true;

  // If bet is PENDING_RESULT but no window set, we can calculate from expires_at
  if (bet.status === 'PENDING_RESULT' && bet.expires_at != null) {
    return true;
  }

  // If bet is expired OPEN/MATCHED (effective PENDING_RESULT), we can calculate from expires_at
  if (isBetPastExpiry(bet.status, bet.expires_at) && bet.expires_at != null) {
    return true;
  }

  return false;
}

/**
 * Check if a bet is in the outcome submission window.
 * Returns true if status is PENDING_RESULT and outcome_window_ends_at is in the future.
 */
export function isInOutcomeWindow(
  bet: {
    status: string | null | undefined;
    outcome_window_ends_at?: string | null;
  },
  now: Date = new Date(),
): boolean {
  if (bet.status !== 'PENDING_RESULT') return false;
  if (!bet.outcome_window_ends_at) return false;
  const windowEnd = parseApiTimestamp(bet.outcome_window_ends_at);
  if (!windowEnd) return false;
  return differenceInSeconds(windowEnd, now) > 0;
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
 * Returns 0 if not in outcome window or window has expired.
 *
 * Supports client-side calculation: when outcome_window_ends_at is NULL but
 * the bet is PENDING_RESULT (or expired OPEN/MATCHED), calculates the window
 * based on expires_at + windowSeconds.
 *
 * @param bet The bet object
 * @param windowSeconds The outcome submission window duration (default: 30s, from room settings)
 * @param now Current time for calculation
 */
export function getOutcomeWindowRemaining(
  bet: {
    status: string | null | undefined;
    outcome_window_ends_at?: string | null;
    expires_at?: string | null;
  },
  windowSeconds: number = 30,
  now: Date = new Date(),
): number {
  // Case 1: outcome_window_ends_at is set - use it directly
  if (bet.outcome_window_ends_at) {
    if (bet.status !== 'PENDING_RESULT') return 0;
    const windowEnd = parseApiTimestamp(bet.outcome_window_ends_at);
    if (!windowEnd) return 0;
    const remaining = differenceInSeconds(windowEnd, now);
    return remaining > 0 ? remaining : 0;
  }

  // Case 2: No outcome_window_ends_at but bet is PENDING_RESULT with expires_at
  // Calculate window from expires_at (server hasn't set it yet, likely pending cron)
  // Note: Server may process bets up to 10s early due to clock skew tolerance,
  // so remaining time may be slightly more than windowSeconds initially.
  if (bet.status === 'PENDING_RESULT' && bet.expires_at) {
    const expiresAt = parseApiTimestamp(bet.expires_at);
    if (!expiresAt) return 0;
    const windowEnd = new Date(expiresAt.getTime() + windowSeconds * 1000);
    const remaining = differenceInSeconds(windowEnd, now);
    return remaining > 0 ? remaining : 0;
  }

  // Case 3: Expired OPEN/MATCHED bet (effective PENDING_RESULT)
  // Calculate window from expires_at
  if (isBetPastExpiry(bet.status, bet.expires_at, now) && bet.expires_at) {
    const expiresAt = parseApiTimestamp(bet.expires_at);
    if (!expiresAt) return 0;
    const windowEnd = new Date(expiresAt.getTime() + windowSeconds * 1000);
    const remaining = differenceInSeconds(windowEnd, now);
    return remaining > 0 ? remaining : 0;
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
