/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Shared with fe-consistency-guard so panels can avoid text-[7/8/10px].
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
