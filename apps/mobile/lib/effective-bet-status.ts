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
 * Status for UI and filters: past-deadline open offers read as EXPIRED even if the row
 * has not been updated yet.
 */
export function getEffectiveBetStatus(
  bet: { status: string | null | undefined; expires_at: string | null | undefined },
  now: Date = new Date(),
): string {
  if (isOpenBetPastExpiry(bet.status, bet.expires_at, now)) return 'EXPIRED';
  return bet.status ?? '';
}
