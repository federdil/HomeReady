/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Core ink scale ──────────────────────────────────────────────────
        ink: {
          DEFAULT: '#2A1620',
          muted:   '#6B5460',
          faint:   '#9A8791',
        },
        // ── Surface scale ────────────────────────────────────────────────────
        surface: {
          DEFAULT: '#FFFFFF',
          2:       '#FDF8F9',
          3:       '#F7EDF0',
        },
        border: {
          DEFAULT: '#EFDCE4',
          strong:  '#E2C7D3',
        },
        // ── Brand (bramble) ──────────────────────────────────────────────────
        brand: {
          DEFAULT: '#9C2F62',
          hover:   '#6E1E45',
          light:   '#FBE9F0',
          mid:     '#BE5183',
          faint:   'rgba(156,47,98,0.08)',
        },
        // ── Semantic ─────────────────────────────────────────────────────────
        success: {
          DEFAULT: '#16A34A',
          bg:      '#F0FDF4',
          border:  '#BBF7D0',
        },
        warning: {
          DEFAULT: '#D97706',
          bg:      '#FFFBEB',
          border:  '#FDE68A',
        },
        danger: {
          DEFAULT: '#DC2626',
          bg:      '#FEF2F2',
          border:  '#FECACA',
        },
        // ── Fit score ramp (validated: see lib/fit.ts) ───────────────────────
        fit: {
          strong: '#0284C7',
          mixed:  '#78716C',
          poor:   '#C2410C',
          none:   '#A89A9F',
        },
        // ── Legacy tokens (kept for backward compat in pages not yet revamped) ──
        plum:    { DEFAULT: '#2A1620', soft: '#6B5460' },
        purple:  { DEFAULT: '#9C2F62', mid: '#BE5183', pale: '#6E1E45', faint: 'rgba(156,47,98,0.08)' },
        dusk:    { DEFAULT: '#F7EDF0', deep: '#EFDCE4' },
        apricot: { DEFAULT: '#F0D4B4', light: '#F8F0E6' },
        sage:    { DEFAULT: '#16A34A', light: '#F0FDF4' },
        amber:   { DEFAULT: '#D97706', light: '#FFFBEB' },
        navy:    { DEFAULT: '#0B1F4B', 50: '#EEF1F8' },
        'purple-faint': 'rgba(156,47,98,0.08)',
        'purple-soft':  '#BE5183',
        'purple-mid':   '#BE5183',
        'dusk-deep':    '#EFDCE4',
        'sage-light':   '#F0FDF4',
        'amber-light':  '#FFFBEB',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans:    ['Inter', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.5' }],
        xs:    ['12px', { lineHeight: '1.5' }],
        sm:    ['13px', { lineHeight: '1.6' }],
        base:  ['15px', { lineHeight: '1.65' }],
        lg:    ['18px', { lineHeight: '1.5' }],
        xl:    ['22px', { lineHeight: '1.4' }],
        '2xl': ['28px', { lineHeight: '1.3' }],
        '3xl': ['36px', { lineHeight: '1.2' }],
        '4xl': ['48px', { lineHeight: '1.0' }],
      },
      borderRadius: {
        sm:    '6px',
        DEFAULT:'8px',
        md:    '10px',
        lg:    '12px',
        xl:    '16px',
        '2xl': '20px',
        '3xl': '24px',
        glass: '20px',
        full:  '9999px',
      },
      boxShadow: {
        xs:  '0 1px 2px 0 rgba(0,0,0,0.05)',
        sm:  '0 1px 3px 0 rgba(0,0,0,0.07), 0 1px 2px -1px rgba(0,0,0,0.07)',
        DEFAULT: '0 2px 8px 0 rgba(0,0,0,0.08)',
        md:  '0 4px 16px 0 rgba(0,0,0,0.10)',
        lg:  '0 8px 32px 0 rgba(0,0,0,0.12)',
        brand: '0 4px 16px 0 rgba(91,61,174,0.25)',
      },
      backdropBlur: {
        '2xl': '24px',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
    },
  },
  plugins: [],
}
