import { differenceInSeconds } from 'date-fns';

import { parseApiTimestamp } from '@/lib/date-format';

/** True when the row is still `OPEN` in the DB but the offer window has ended. */
export function isOpenBetPastExpiry(
  status: string | null | undefined,
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== 'OPEN') return false;
  const end = parseApiTimestamp(expiresAt ?? null);
  if (!end) return false;
  return differenceInSeconds(end, now) <= 0;
}

/**
 * Check if a bet has stakes on both sides (is matched).
 * Requires bet.stakes array with pick field.
 */
function isBetMatched(stakes: Array<{ pick: string }> | undefined): boolean {
  if (!stakes || stakes.length < 2) return false;
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
