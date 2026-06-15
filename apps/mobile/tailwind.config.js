/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './providers/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Light theme: Vintage blue, white & green palette
        background: '#F3F4F6',
        surface: '#FFFFFF',
        'surface-light': '#E5E7EB',
        border: '#D1D5DB',
        primary: {
          DEFAULT: '#4D8A8A',
          dark: '#3D7A7A',
          light: '#6BB5AC',
        },
        secondary: '#5B86A0',
        accent: '#7DAE7E',
        success: '#16A34A',
        error: '#DC2626',
        warning: '#D97706',
        'text-primary': '#1F2937',
        'text-secondary': '#4B5563',
        'text-muted': '#6B7280',
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
