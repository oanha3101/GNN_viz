/** @type {import('tailwindcss').Config} */
//
// Galaxy Constellation Design System v2
// Mirrors src/theme/tokens.js — keep both in sync.
//
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },

      colors: {
        // Deep Space backgrounds
        void: '#050210',
        abyss: '#0a0519',
        deep: '#0e0822',
        nebula: '#140d30',
        dust: '#1a1240',
        cloud: '#221850',

        // Panel aliases (backward compat)
        panel: '#0e0822',
        'panel-soft': '#140d30',
        surface: '#1a1240',
        divider: 'rgba(139, 92, 246, 0.15)',

        // Stellar accents
        amethyst: '#9333ea',
        'nebula-core': '#7c3aed',
        cosmic: '#6d28d9',

        // Aurora spectrum
        'aurora-blue': '#818cf8',
        'aurora-cyan': '#22d3ee',
        'aurora-pink': '#f472b6',
        'aurora-green': '#34d399',
        'aurora-amber': '#fbbf24',
        'aurora-rose': '#f43f5e',

        // Starlight text
        'white-star': '#f0eeff',
        starlight: '#c4b5fd',
        moonlight: '#a78bfa',
        twilight: '#7c6faa',
        'text-shadow': '#4c3d80',

        // Constellation lines
        'line-subtle': 'rgba(139, 92, 246, 0.06)',
        'line-default': 'rgba(139, 92, 246, 0.15)',
        'line-active': 'rgba(139, 92, 246, 0.35)',
        'line-glow': 'rgba(139, 92, 246, 0.50)',
      },

      fontSize: {
        nano: ['9px', '12px'],
        micro: ['10px', '14px'],
      },

      letterSpacing: {
        tight: '-0.02em',
        wide: '0.02em',
        ultra: '0.1em',
        uppercase: '0.12em',
      },

      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
      },

      boxShadow: {
        'glow-sm': '0 0 8px rgba(147,51,234,0.2), 0 0 24px rgba(147,51,234,0.06)',
        'glow-md': '0 0 16px rgba(147,51,234,0.3), 0 0 48px rgba(147,51,234,0.1)',
        'glow-lg': '0 0 24px rgba(147,51,234,0.4), 0 0 80px rgba(147,51,234,0.15)',
        'aurora-sm': '0 0 8px rgba(129,140,248,0.2), 0 0 24px rgba(129,140,248,0.06)',
        'aurora-md': '0 0 16px rgba(129,140,248,0.3), 0 0 48px rgba(129,140,248,0.1)',
        'depth-sm': '0 2px 8px rgba(0,0,0,0.3)',
        'depth-md': '0 4px 16px rgba(0,0,0,0.4)',
        'depth-lg': '0 8px 32px rgba(0,0,0,0.5)',
        'panel-sm': '0 2px 8px rgba(0,0,0,0.3), 0 0 8px rgba(147,51,234,0.06)',
        'panel-md': '0 4px 16px rgba(0,0,0,0.4), 0 0 16px rgba(147,51,234,0.08)',
        'panel-lg': '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(147,51,234,0.12)',
      },

      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        shimmer: 'shimmer 2s infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'gradient-shift': 'gradient-shift 3s ease infinite',
        'spin-slow': 'spin-slow 8s linear infinite',
        twinkle: 'twinkle 6s ease-in-out infinite alternate',
        float: 'float 6s ease-in-out infinite',
        'constellation-pulse': 'constellation-pulse 4s ease-in-out infinite',
      },

      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(147,51,234,0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(147,51,234,0.4)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
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
        'constellation-pulse': {
          '0%, 100%': { opacity: '0.15' },
          '50%': { opacity: '0.4' },
        },
      },

      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '12px',
        lg: '20px',
        xl: '28px',
      },
    },
  },
  plugins: [],
}
