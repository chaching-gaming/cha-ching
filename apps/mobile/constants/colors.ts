const amber = '#F59E0B' as const;

export const colors = {
  // Green/Teal palette (darker)
  background: '#011E22',
  surface: '#02353C',
  surfaceLight: '#054550',
  border: '#086568',
  primary: '#2EAF7D',
  primaryDark: '#238F66',
  primaryLight: '#3FD0C9',
  secondary: '#3FD0C9',
  accent: '#C1F6ED',
  success: '#449342',
  error: '#EF4444',
  warning: amber,
  /** Phosphor `Coins` / chip glyphs — use everywhere chips are represented as an icon */
  chipsIcon: amber,
  textPrimary: '#FFFFFF',
  textSecondary: '#A8D5D0',
  textMuted: '#6B9E99',
  /** Medal colors for standings podium */
  medal: {
    gold: '#F59E0B',
    silver: '#A8D5D0',
    bronze: '#B97F4C',
  },
  /** Confetti colors for celebration animations */
  confetti: ['#C1F6ED', '#2EAF7D', '#3FD0C9', '#449342', '#F59E0B', '#EF476F'],
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
