const amber = '#F59E0B' as const;

export const colors = {
  background: '#0B1120',
  surface: '#162033',
  surfaceLight: '#1A2744',
  border: '#1E3A5F',
  primary: '#22C55E',
  primaryDark: '#16A34A',
  error: '#EF4444',
  warning: amber,
  /** Phosphor `Coins` / chip glyphs — use everywhere chips are represented as an icon */
  chipsIcon: amber,
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
} as const;

export default {
  light: {
    text: colors.textPrimary,
    background: colors.background,
    tint: colors.primary,
    tabIconDefault: colors.textMuted,
    tabIconSelected: colors.primary,
  },
  dark: {
    text: colors.textPrimary,
    background: colors.background,
    tint: colors.primary,
    tabIconDefault: colors.textMuted,
    tabIconSelected: colors.primary,
  },
};
