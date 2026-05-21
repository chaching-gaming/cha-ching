import { createElement } from 'react';
import { Disc, Flag, Target, Warning } from 'phosphor-react-native';

// Expiries tuned for quick, in-the-moment golf bets:
//   30s — immediate shot outcome
//   1m  — a single putt or tee shot
//   2m  — slightly longer play
export const EXPIRY_PRESETS = [
  { label: '30s', offsetMs: 30_000 },
  { label: '1m', offsetMs: 60_000 },
  { label: '2m', offsetMs: 120_000 },
] as const;

// Contextual option labels per template
export const TEMPLATE_LABELS: Record<string, { positive: string; negative: string }> = {
  fairway: { positive: 'Hit', negative: 'Miss' },
  green: { positive: 'Hit', negative: 'Miss' },
  putt: { positive: 'Make', negative: 'Miss' },
  three_putt: { positive: 'Yes', negative: 'No' },
  default: { positive: 'Yes', negative: 'No' },
};

export function getTemplateLabels(slug: string | null): { positive: string; negative: string } {
  return TEMPLATE_LABELS[slug ?? 'default'] ?? TEMPLATE_LABELS.default;
}

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

/** Returns true if the template's question_text contains {player} placeholder */
export function templateRequiresPlayer(questionText: string | null | undefined): boolean {
  return questionText?.includes('{player}') ?? false;
}

export function composeWriteInQuestion(trimmedBody: string, displayName: string): string {
  return `For ${displayName.trim()}: ${trimmedBody}`;
}

// Custom expiry configuration
export const CUSTOM_EXPIRY = {
  MIN_MINUTES: 1,
  MAX_MINUTES: 1440, // 24 hours
} as const;

export type ExpiryUnit = 'min' | 'hr';

export function customExpiryToMs(value: number, unit: ExpiryUnit): number {
  const minutes = unit === 'hr' ? value * 60 : value;
  return minutes * 60_000;
}

export function formatCustomExpiryLabel(value: number, unit: ExpiryUnit): string {
  if (unit === 'hr') return value === 1 ? '1 hour' : `${value} hours`;
  return value === 1 ? '1 minute' : `${value} minutes`;
}
