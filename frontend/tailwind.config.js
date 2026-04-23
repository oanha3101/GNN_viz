/** @type {import('tailwindcss').Config} */
//
// Keep this in sync with src/theme/tokens.js.
// We expose tokens as Tailwind utilities so that `fe-consistency-guard`
// can ban arbitrary values like `text-[7px]` / `rounded-[2rem]`.
//
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        panel: '#050c19',
        'panel-soft': '#071120',
        surface: '#0b1224',
        divider: '#1e293b',
      },
      fontSize: {
        // Matches tokens.font.size — paired with sensible line-heights.
        nano: ['9px', '12px'],
        micro: ['10px', '14px'],
      },
      letterSpacing: {
        ultra: '0.2em',
      },
    },
  },
  plugins: [],
}
