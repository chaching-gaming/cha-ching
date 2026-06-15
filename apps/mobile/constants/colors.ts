const amber = '#D97706' as const;

export const colors = {
  // Light theme: Vintage blue, white & green palette
  background: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceLight: '#E5E7EB',
  border: '#D1D5DB',
  primary: '#4D8A8A',
  primaryDark: '#3D7A7A',
  primaryLight: '#6BB5AC',
  secondary: '#5B86A0',
  accent: '#7DAE7E',
  success: '#16A34A',
  error: '#DC2626',
  warning: amber,
  /** Phosphor `Coins` / chip glyphs — use everywhere chips are represented as an icon */
  chipsIcon: amber,
  textPrimary: '#1F2937',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  /** Medal colors for standings podium */
  medal: {
    gold: '#D97706',
    silver: '#6B7280',
    bronze: '#B45309',
  },
  /** Confetti colors for celebration animations */
  confetti: ['#7DAE7E', '#4D8A8A', '#6BB5AC', '#16A34A', '#D97706', '#5B86A0'],
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
