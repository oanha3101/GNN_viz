http://localhost:5173/app/profileimport { motion } from 'framer-motion'

/**
 * FloatingMetricPanel - Premium floating metric card for landing hero section
 * 
 * Features:
 * - Glassmorphic design with backdrop blur
 * - Smooth float animation
 * - Gradient crimson/magenta accent
 * - Dark mode support
 * - Responsive (hidden on < 1280px)
 * 
 * @param {string} label - Uppercase label (e.g., "ATTENTION SCORE")
 * @param {string|number} value - Main value to display
 * @param {string} sublabel - Optional secondary label
 * @param {string} position - Position: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'mid-left' | 'mid-right'
 * @param {number} delay - Animation delay in seconds
 */
export default function FloatingMetricPanel({
    label,
    value,
    sublabel,
    position = 'top-right',
    delay = 0
}) {
    const positionClasses = {
        'top-left': 'floating-panel--top-left',
        'top-right': 'floating-panel--top-right',
        'bottom-right': 'floating-panel--bottom-right',
        'bottom-left': 'floating-panel--bottom-left',
        'mid-left': 'floating-panel--mid-left',
        'mid-right': 'floating-panel--mid-right'
    }

    return (
        <motion.div
            className={`floating-panel ${positionClasses[position]}`}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                duration: 0.8,
                delay: delay,
                ease: [0.22, 1, 0.36, 1]
            }}
        >
            <div className="floating-panel__label">{label}</div>
            <div className="floating-panel__value">{value}</div>
            {sublabel && (
                <div className="floating-panel__sublabel">{sublabel}</div>
            )}
        </motion.div>
    )
}
