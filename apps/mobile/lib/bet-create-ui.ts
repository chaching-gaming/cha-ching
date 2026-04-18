import { createElement } from 'react';
import { Disc, Flag, Target, Warning } from 'phosphor-react-native';

// Expiries tuned to golf pacing:
//   1m  — a single putt or tee shot (resolves in seconds)
//   5m  — the current hole plays out
//   15m — a couple holes
//   1h  — the rest of a nine / back-half of a round
export const EXPIRY_PRESETS = [
  { label: '1m', offsetMs: 60_000 },
  { label: '5m', offsetMs: 5 * 60_000 },
  { label: '15m', offsetMs: 15 * 60_000 },
  { label: '1h', offsetMs: 60 * 60_000 },
] as const;

const SLUG_ICONS: Record<string, typeof Flag> = {
  fairway: Flag,
  green: Target,
  putt: Disc,
  three_putt: Warning,
};

export function BetTemplateIcon({
  slug,
  color,
  size = 36,
}: {
  slug: string;
  color: string;
  size?: number;
}) {
  const Cmp = SLUG_ICONS[slug] ?? Flag;
  return createElement(Cmp, { size, color, weight: 'fill' as const });
}

export function composeTemplateQuestion(pattern: string, displayName: string): string {
  return pattern.replace(/\{player\}/g, displayName.trim());
}

export function composeWriteInQuestion(trimmedBody: string, displayName: string): string {
  return `For ${displayName.trim()}: ${trimmedBody}`;
}
