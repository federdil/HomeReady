/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Core ink scale ──────────────────────────────────────────────────
        ink: {
          DEFAULT: '#111827',
          muted:   '#4B5563',
          faint:   '#9CA3AF',
        },
        // ── Surface scale ────────────────────────────────────────────────────
        surface: {
          DEFAULT: '#FFFFFF',
          2:       '#F9FAFB',
          3:       '#F3F4F6',
        },
        border: {
          DEFAULT: '#E5E7EB',
          strong:  '#D1D5DB',
        },
        // ── Brand (purple) ───────────────────────────────────────────────────
        brand: {
          DEFAULT: '#5B3DAE',
          hover:   '#4A2F96',
          light:   '#EDE9F8',
          mid:     '#7B55C8',
          faint:   'rgba(91,61,174,0.08)',
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
        // ── Legacy tokens (kept for backward compat in pages not yet revamped) ──
        plum:    { DEFAULT: '#111827', soft: '#4B5563' },
        purple:  { DEFAULT: '#5B3DAE', mid: '#7B55C8', pale: '#4A2F96', faint: 'rgba(91,61,174,0.08)' },
        dusk:    { DEFAULT: '#F3F4F6', deep: '#E5E7EB' },
        apricot: { DEFAULT: '#F0D4B4', light: '#F8F0E6' },
        sage:    { DEFAULT: '#16A34A', light: '#F0FDF4' },
        amber:   { DEFAULT: '#D97706', light: '#FFFBEB' },
        navy:    { DEFAULT: '#0B1F4B', 50: '#EEF1F8' },
        'purple-faint': 'rgba(91,61,174,0.08)',
        'purple-soft':  '#7B55C8',
        'purple-mid':   '#7B55C8',
        'dusk-deep':    '#E5E7EB',
        'sage-light':   '#F0FDF4',
        'amber-light':  '#FFFBEB',
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'serif'],
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
