/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './providers/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#0B1120',
        surface: '#162033',
        'surface-light': '#1A2744',
        border: '#1E3A5F',
        primary: {
          DEFAULT: '#22C55E',
          dark: '#16A34A',
        },
        error: '#EF4444',
        warning: '#F59E0B',
        'text-primary': '#FFFFFF',
        'text-secondary': '#94A3B8',
        'text-muted': '#64748B',
      },
      fontFamily: {
        mono: ['SpaceMono'],
      },
    },
  },
  plugins: [],
};
