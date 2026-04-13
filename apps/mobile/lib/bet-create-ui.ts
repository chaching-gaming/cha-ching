import { createElement } from 'react';
import { Disc, Flag, Target, Warning } from 'phosphor-react-native';

export const EXPIRY_PRESETS = [
  { label: '30s', offsetMs: 30_000 },
  { label: '1m', offsetMs: 60_000 },
  { label: '5m', offsetMs: 5 * 60_000 },
  { label: '15m', offsetMs: 15 * 60_000 },
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
