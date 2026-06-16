const amber = '#D97706' as const;

/** Light theme colors */
export const lightColors = {
  background: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceLight: '#E5E7EB',
  surfaceAlt: '#F3F4F6',
  border: '#D1D5DB',
  primary: '#4D8A8A',
  primaryDark: '#3D7A7A',
  primaryLight: '#6BB5AC',
  secondary: '#5B86A0',
  accent: '#7DAE7E',
  success: '#16A34A',
  error: '#DC2626',
  warning: amber,
  chipsIcon: amber,
  textPrimary: '#1F2937',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  medal: {
    gold: '#D97706',
    silver: '#6B7280',
    bronze: '#B45309',
  },
  confetti: ['#7DAE7E', '#4D8A8A', '#6BB5AC', '#16A34A', '#D97706', '#5B86A0'],
} as const;

/** Dark theme colors */
export const darkColors = {
  background: '#111827',
  surface: '#1F2937',
  surfaceLight: '#374151',
  surfaceAlt: '#1F2937',
  border: '#374151',
  primary: '#4D8A8A',
  primaryDark: '#3D7A7A',
  primaryLight: '#6BB5AC',
  secondary: '#5B86A0',
  accent: '#7DAE7E',
  success: '#22C55E',
  error: '#EF4444',
  warning: amber,
  chipsIcon: amber,
  textPrimary: '#F9FAFB',
  textSecondary: '#D1D5DB',
  textMuted: '#9CA3AF',
  medal: {
    gold: '#D97706',
    silver: '#9CA3AF',
    bronze: '#B45309',
  },
  confetti: ['#7DAE7E', '#4D8A8A', '#6BB5AC', '#16A34A', '#D97706', '#5B86A0'],
} as const;

/** Type for theme-aware colors - uses string for color values to allow both light/dark themes */
export type ThemeColors = {
  background: string;
  surface: string;
  surfaceLight: string;
  surfaceAlt: string;
  border: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  success: string;
  error: string;
  warning: string;
  chipsIcon: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  medal: {
    gold: string;
    silver: string;
    bronze: string;
  };
  confetti: readonly string[];
};

/** Default colors export (light theme for backwards compatibility) */
export const colors = lightColors;

export default {
  light: {
    text: lightColors.textPrimary,
    background: lightColors.background,
    tint: lightColors.primary,
    tabIconDefault: lightColors.textMuted,
    tabIconSelected: lightColors.primary,
  },
  dark: {
    text: darkColors.textPrimary,
    background: darkColors.background,
    tint: darkColors.primary,
    tabIconDefault: darkColors.textMuted,
    tabIconSelected: darkColors.primary,
  },
};
