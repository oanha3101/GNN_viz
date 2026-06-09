import { Moon, SunMedium } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

export default function ThemeToggle({ className = '', size = 'md' }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  const sizeMap = {
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-10 w-10',
  }
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`theme-toggle ${sizeMap[size] || sizeMap.md} justify-center !p-0 ${className}`}
    >
      {isDark ? <SunMedium size={iconSize} /> : <Moon size={iconSize} />}
    </button>
  )
}
