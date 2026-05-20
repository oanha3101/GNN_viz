/** @type {import('tailwindcss').Config} */
//
// Aurora Premium Design System (light: red/white, dark: blue/black).
// All theme colors are driven by CSS variables in src/index.css, so existing
// utility classes (text-twilight, bg-deep, border-line-default, ...) keep
// working but automatically swap when the `dark` class flips on <html>.
//
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Inter"',
          '"Inter Variable"',
          '"SF Pro Display"',
          'system-ui',
          'sans-serif',
        ],
        display: [
          '"Inter"',
          '"Inter Variable"',
          '"SF Pro Display"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', '"Fira Code"', 'monospace'],
      },

      colors: {
        // ── Page surfaces (deep-space → semantic) ──
        void: 'var(--c-bg-deepest)',
        abyss: 'var(--c-bg)',
        deep: 'var(--c-bg-elev)',
        nebula: 'var(--c-bg-muted)',
        dust: 'var(--c-surface-hover)',
        cloud: 'var(--c-surface-strong)',

        // Backward-compat panel aliases
        panel: 'var(--c-bg-elev)',
        'panel-soft': 'var(--c-bg-muted)',
        surface: 'var(--c-surface-hover)',
        divider: 'var(--c-divider)',

        // ── Brand primary ──
        amethyst: 'var(--c-primary)',
        'nebula-core': 'var(--c-primary-hover)',
        cosmic: 'var(--c-primary-strong)',

        // ── Secondary palette (semantic) ──
        'aurora-blue': 'var(--c-accent-blue)',
        'aurora-cyan': 'var(--c-accent-cyan)',
        'aurora-pink': 'var(--c-accent-pink)',
        'aurora-green': 'var(--c-success)',
        'aurora-amber': 'var(--c-warning)',
        'aurora-rose': 'var(--c-danger)',

        // ── Text scale ──
        'white-star': 'var(--c-fg)',
        starlight: 'var(--c-fg)',
        moonlight: 'var(--c-fg-muted)',
        twilight: 'var(--c-fg-subtle)',
        'text-shadow': 'var(--c-fg-faint)',

        // ── Borders ──
        'line-subtle': 'var(--c-border-subtle)',
        'line-default': 'var(--c-border)',
        'line-active': 'var(--c-border-strong)',
        'line-glow': 'var(--c-primary-glow)',
      },

      fontSize: {
        nano: ['10px', '14px'],
        micro: ['11px', '15px'],
      },

      letterSpacing: {
        tight: '-0.02em',
        wide: '0.02em',
        ultra: '0.08em',
        uppercase: '0.10em',
      },

      borderRadius: {
        xs: '6px',
        sm: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
        '3xl': '28px',
      },

      boxShadow: {
        'glow-sm': '0 1px 2px rgba(15,23,42,0.04), 0 4px 10px rgba(15,23,42,0.04)',
        'glow-md': '0 6px 20px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.05)',
        'glow-lg': '0 18px 44px rgba(15,23,42,0.12), 0 4px 10px rgba(15,23,42,0.06)',
        'aurora-sm': '0 6px 18px rgba(15,23,42,0.06)',
        'aurora-md': '0 10px 30px rgba(15,23,42,0.10)',
        'depth-sm': '0 1px 2px rgba(15,23,42,0.06)',
        'depth-md': '0 8px 24px rgba(15,23,42,0.10)',
        'depth-lg': '0 24px 60px rgba(15,23,42,0.16)',
        'panel-sm': '0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.04)',
        'panel-md': '0 4px 12px rgba(15,23,42,0.05), 0 16px 40px rgba(15,23,42,0.08)',
        'panel-lg': '0 12px 32px rgba(15,23,42,0.08), 0 32px 70px rgba(15,23,42,0.14)',
      },

      animation: {
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite',
        shimmer: 'shimmer 2.4s infinite',
        'fade-in': 'fade-in 0.4s ease-out',
        'fade-in-up': 'fade-in-up 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-in-right': 'slide-in-right 0.4s ease-out',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'spin-slow': 'spin-slow 8s linear infinite',
        twinkle: 'twinkle 6s ease-in-out infinite alternate',
        float: 'float 7s ease-in-out infinite',
        'aurora-pulse': 'aurora-pulse 6s ease-in-out infinite',
      },

      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0,0,0,0)' },
          '50%': { boxShadow: '0 0 0 6px rgba(0,0,0,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'gradient-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        twinkle: {
          '0%': { opacity: '0.3' },
          '100%': { opacity: '0.8' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'aurora-pulse': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.04)' },
        },
      },

      backdropBlur: {
        xs: '2px',
        sm: '6px',
        md: '12px',
        lg: '20px',
        xl: '28px',
      },
    },
  },
  plugins: [],
}
