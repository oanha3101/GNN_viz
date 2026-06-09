import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

/**
 * CountUpStat - Animated count-up statistic with premium styling
 * 
 * Features:
 * - Smooth count-up animation when scrolled into view
 * - Handles special values (∞, percentages)
 * - Gradient text effect
 * - Animated indicator bar
 * - Hover effects
 * 
 * @param {string|number} value - The target value
 * @param {string} label - Label text below the value
 * @param {number} duration - Animation duration in ms (default: 2000)
 * @param {boolean} isInfinite - Whether value is infinity symbol
 * @param {boolean} isPercentage - Whether value is a percentage
 */
export default function CountUpStat({
    value,
    label,
    duration = 2000,
    isInfinite = false,
    isPercentage = false
}) {
    const [count, setCount] = useState(0)
    const [hasAnimated, setHasAnimated] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        // Check if prefers reduced motion
        const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

        // Intersection Observer to trigger animation when in view
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !hasAnimated) {
                    setHasAnimated(true)

                    // Handle special values
                    if (isInfinite || value === '∞') {
                        setCount('∞')
                        return
                    }

                    // Handle percentage strings like "100%"
                    let targetValue = value
                    if (typeof value === 'string') {
                        targetValue = parseFloat(value.replace('%', ''))
                    }

                    if (isNaN(targetValue)) {
                        setCount(value)
                        return
                    }

                    // Skip animation if reduced motion is preferred
                    if (prefersReducedMotion) {
                        setCount(isPercentage ? `${targetValue}%` : targetValue)
                        return
                    }

                    // Animate count up
                    const steps = 60
                    const increment = targetValue / steps
                    const interval = duration / steps
                    let current = 0

                    const timer = setInterval(() => {
                        current += increment
                        if (current >= targetValue) {
                            setCount(isPercentage ? `${targetValue}%` : targetValue)
                            clearInterval(timer)
                        } else {
                            const displayValue = Math.floor(current)
                            setCount(isPercentage ? `${displayValue}%` : displayValue)
                        }
                    }, interval)

                    return () => clearInterval(timer)
                }
            },
            { threshold: 0.3 }
        )

        if (ref.current) {
            observer.observe(ref.current)
        }

        return () => {
            if (ref.current) {
                observer.unobserve(ref.current)
            }
        }
    }, [value, duration, hasAnimated, isInfinite, isPercentage])

    return (
        <motion.div
            ref={ref}
            className="text-center"
            whileHover={{ scale: 1.08, transition: { type: 'spring', stiffness: 400, damping: 15 } }}
        >
            <div className="landing-stat-number count-up">
                {count}
            </div>
            <div className="landing-stat-label">{label}</div>
            <div className="landing-stat-bar" />
        </motion.div>
    )
}
