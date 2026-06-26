/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        plum:    { DEFAULT: '#1E1030', soft: '#6B5A8A' },
        purple:  { DEFAULT: '#5B3DAE', mid: '#7B55C8', pale: '#4A3280', faint: 'rgba(130,100,200,0.12)' },
        dusk:    { DEFAULT: '#EEE9F5', deep: '#E0D5F0' },
        apricot: { DEFAULT: '#F0D4B4', light: '#F8F0E6' },
        sage:    { DEFAULT: '#22A05A', light: '#EAF5EE' },
        amber:   { DEFAULT: '#D97706', light: '#FFFBEB' },
        // keep old tokens for pages not yet reskinned
        navy:    { DEFAULT: '#0B1F4B', 50: '#EEF1F8' },
        brand:   { DEFAULT: '#5B3DAE', light: '#7B55C8', pale: '#EEE9F5' },
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'serif'],
        sans:    ['Inter', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
      },
      backdropBlur: {
        '2xl': '24px',
      },
      borderRadius: {
        'glass': '18px',
      },
    },
  },
  plugins: [],
}
