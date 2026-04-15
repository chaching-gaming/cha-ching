import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
  format,
  parse,
  parseISO,
} from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';

const SESSION_DATE_PARSE = 'yyyy-MM-dd';

/** Parse `session_date` / calendar-only strings (`yyyy-MM-dd`) in the device local timezone */
export function parseSessionCalendarDate(dateStr: string): Date {
  return parse(dateStr, SESSION_DATE_PARSE, new Date());
}

/** Today as `yyyy-MM-dd` (e.g. RPC `p_session_date`) */
export function formatTodayCalendarDate(): string {
  return format(new Date(), SESSION_DATE_PARSE);
}

/**
 * Room list + create-room preview — short month, no year.
 * Example: Jan 15
 */
export function formatSessionDateShort(dateStr: string): string {
  return format(parseSessionCalendarDate(dateStr), 'MMM d', { locale: enUS });
}

/**
 * Profile session history — short month with year.
 * Example: Jan 15, 2026
 */
export function formatSessionDateMedium(dateStr: string): string {
  return format(parseSessionCalendarDate(dateStr), 'MMM d, yyyy', { locale: enUS });
}

/**
 * Room detail header — full month with year.
 * Example: January 15, 2026
 */
export function formatSessionDateLong(dateStr: string): string {
  return format(parseSessionCalendarDate(dateStr), 'MMMM d, yyyy', { locale: enUS });
}

/**
 * Postgres / Supabase often returns fractional seconds beyond ms (e.g. `.67735`).
 * Truncate to ms so `parseISO` / engines parse consistently.
 */
function truncateIsoFractionalSeconds(s: string): string {
  return s.replace(/(\.\d{3})\d+/, '$1');
}

/** True if the string already ends with `Z` or a `±hh:mm` / `±hhmm` offset. */
function hasExplicitTimeZone(isoLike: string): boolean {
  return /[zZ]$|[+-]\d{2}(:\d{2})?$/.test(isoLike.trim());
}

/**
 * Activity `created_at` values are usually UTC timestamptz serialized without `Z`.
 * ECMAScript treats that as *local* wall time, which skews relative times — append `Z` when missing.
 */
function normalizeActivityTimestamp(raw: string): string {
  let s = truncateIsoFractionalSeconds(raw.trim());
  if (!s) return s;
  if (s.includes('T') && !hasExplicitTimeZone(s)) {
    s = `${s}Z`;
  }
  return s;
}

/** Parse API `timestamptz` / ISO strings (fraction trim + naive UTC when no offset). */
export function parseApiTimestamp(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const normalized = normalizeActivityTimestamp(iso);
  const fromIso = parseISO(normalized);
  if (!Number.isNaN(fromIso.getTime())) return fromIso;
  const fallback = new Date(normalized);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseActivityInstant(timestamp: string): Date | null {
  return parseApiTimestamp(timestamp);
}

/**
 * Countdown for open bets (e.g. `4:32 remaining`). Pass a ticking `now` for live updates.
 * Returns null when there is no `expires_at`, or `Time up` after expiry.
 */
export function formatBetCountdown(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const end = parseApiTimestamp(expiresAt ?? null);
  if (!end) return null;
  const sec = differenceInSeconds(end, now);
  if (sec <= 0) return 'Time up';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, '0')} remaining`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m left`;
}

/**
 * Activity feed line — compact relative time (same style as before: just now / 5m ago / …).
 */
export function formatRelativeActivityTime(timestamp: string): string {
  const then = parseActivityInstant(timestamp);
  if (!then) return '';

  const now = new Date();
  const sec = Math.max(0, differenceInSeconds(now, then));
  if (sec < 60) return 'just now';

  const min = Math.max(0, differenceInMinutes(now, then));
  if (min < 60) return `${min}m ago`;

  const hr = Math.max(0, differenceInHours(now, then));
  if (hr < 24) return `${hr}h ago`;

  const day = Math.max(0, differenceInDays(now, then));
  return `${day}d ago`;
}
