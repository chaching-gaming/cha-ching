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

/** Dark theme colors - Original green/teal palette */
export const darkColors = {
  background: '#011E22',
  surface: '#02353C',
  surfaceLight: '#054550',
  surfaceAlt: '#02353C',
  border: '#086568',
  primary: '#2EAF7D',
  primaryDark: '#238F66',
  primaryLight: '#3FD0C9',
  secondary: '#3FD0C9',
  accent: '#C1F6ED',
  success: '#449342',
  error: '#EF4444',
  warning: '#F59E0B',
  chipsIcon: '#F59E0B',
  textPrimary: '#FFFFFF',
  textSecondary: '#A8D5D0',
  textMuted: '#6B9E99',
  medal: {
    gold: '#F59E0B',
    silver: '#A8D5D0',
    bronze: '#B97F4C',
  },
  confetti: ['#C1F6ED', '#2EAF7D', '#3FD0C9', '#449342', '#F59E0B', '#EF476F'],
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
