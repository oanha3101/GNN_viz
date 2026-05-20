import { motion } from 'framer-motion'

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`empty-state w-full flex flex-col items-center justify-center text-center p-6 rounded-2xl ${className}`}
    >
      {icon && (
        <div className="empty-state-icon" aria-hidden="true">
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            {icon}
          </motion.div>
        </div>
      )}
      <h4 className="empty-state-title">{title}</h4>
      {description && (
        <p className="empty-state-desc">{description}</p>
      )}
      {actionLabel && onAction && (
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={onAction}
          className="empty-state-action"
        >
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  )
}

export default EmptyState
