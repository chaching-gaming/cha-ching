/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './providers/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Theme-aware colors (CSS variables - auto-switch with .dark class)
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-light': 'rgb(var(--color-surface-light) / <alpha-value>)',
        'surface-alt': 'rgb(var(--color-surface-alt) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        'text-primary': 'rgb(var(--color-text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--color-text-secondary) / <alpha-value>)',
        'text-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        error: 'rgb(var(--color-error) / <alpha-value>)',

        // Static colors (same in light & dark)
        primary: {
          DEFAULT: '#4D8A8A',
          dark: '#3D7A7A',
          light: '#6BB5AC',
        },
        secondary: '#5B86A0',
        accent: '#7DAE7E',
        warning: '#D97706',

        // Medal colors for standings
        'medal-gold': '#D97706',
        'medal-silver': '#6B7280',
        'medal-bronze': '#B45309',

        // Confetti colors for celebrations
        'confetti-1': '#7DAE7E',
        'confetti-2': '#4D8A8A',
        'confetti-3': '#6BB5AC',
        'confetti-4': '#16A34A',
        'confetti-5': '#D97706',
        'confetti-6': '#5B86A0',
      },
      fontFamily: {
        mono: ['SpaceMono'],
      },
    },
  },
  plugins: [],
};
