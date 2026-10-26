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
        warning: 'rgb(var(--color-warning) / <alpha-value>)',

        // Primary colors (theme-aware)
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          dark: 'rgb(var(--color-primary-dark) / <alpha-value>)',
          light: 'rgb(var(--color-primary-light) / <alpha-value>)',
        },
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',

        // Medal colors for standings (theme-aware)
        'medal-gold': 'rgb(var(--color-medal-gold) / <alpha-value>)',
        'medal-silver': 'rgb(var(--color-medal-silver) / <alpha-value>)',
        'medal-bronze': 'rgb(var(--color-medal-bronze) / <alpha-value>)',

        // Confetti colors for celebrations (theme-aware)
        'confetti-1': 'rgb(var(--color-confetti-1) / <alpha-value>)',
        'confetti-2': 'rgb(var(--color-confetti-2) / <alpha-value>)',
        'confetti-3': 'rgb(var(--color-confetti-3) / <alpha-value>)',
        'confetti-4': 'rgb(var(--color-confetti-4) / <alpha-value>)',
        'confetti-5': 'rgb(var(--color-confetti-5) / <alpha-value>)',
        'confetti-6': 'rgb(var(--color-confetti-6) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['SpaceMono'],
      },
    },
  },
  plugins: [],
};
