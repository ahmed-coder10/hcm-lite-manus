/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#05060B',
          900: '#080A12',
          850: '#0B0E18',
          800: '#10141F',
          700: '#171C2B',
          600: '#212739',
        },
        violet: { DEFAULT: '#7C5CFF', soft: '#A78BFA', deep: '#5B3EE8' },
        cyan: { DEFAULT: '#22D3EE', soft: '#67E8F9' },
        mint: { DEFAULT: '#3DDC97' },
        amber: { DEFAULT: '#FFB86B' },
        rose: { DEFAULT: '#FF6B8A' },
        text: { DEFAULT: '#EEF1F8', muted: '#9AA3B8', faint: '#6B7488' },
      },
      fontFamily: {
        display: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
      },
      borderRadius: {
        xl2: '1.25rem',
        '4xl': '2rem',
      },
      boxShadow: {
        glow: '0 0 60px -12px rgba(124,92,255,0.55)',
        'glow-cyan': '0 0 50px -14px rgba(34,211,238,0.5)',
        card: '0 24px 60px -32px rgba(0,0,0,0.9)',
        insetline: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'aurora-radial':
          'radial-gradient(60% 60% at 50% 0%, rgba(124,92,255,0.22) 0%, rgba(5,6,11,0) 70%)',
        'grid-lines':
          'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
      },
      keyframes: {
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { opacity: '0' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        spinSlow: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
        marquee: 'marquee 32s linear infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        pulseRing: 'pulseRing 2.4s cubic-bezier(0.2,0.6,0.3,1) infinite',
        fadeUp: 'fadeUp 0.5s cubic-bezier(0.2,0.7,0.3,1) both',
        spinSlow: 'spinSlow 26s linear infinite',
      },
    },
  },
  plugins: [],
};
