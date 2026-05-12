/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './providers/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Green/Teal palette (darker)
        background: '#011E22',
        surface: '#02353C',
        'surface-light': '#054550',
        border: '#086568',
        primary: {
          DEFAULT: '#2EAF7D',
          dark: '#238F66',
          light: '#3FD0C9',
        },
        secondary: '#3FD0C9',
        accent: '#C1F6ED',
        success: '#449342',
        error: '#EF4444',
        warning: '#F59E0B',
        'text-primary': '#FFFFFF',
        'text-secondary': '#A8D5D0',
        'text-muted': '#6B9E99',
        // Medal colors for standings
        'medal-gold': '#F59E0B',
        'medal-silver': '#A8D5D0',
        'medal-bronze': '#B97F4C',
        // Confetti colors for celebrations
        'confetti-1': '#C1F6ED',
        'confetti-2': '#2EAF7D',
        'confetti-3': '#3FD0C9',
        'confetti-4': '#449342',
        'confetti-5': '#F59E0B',
        'confetti-6': '#EF476F',
      },
      fontFamily: {
        mono: ['SpaceMono'],
      },
    },
  },
  plugins: [],
};
