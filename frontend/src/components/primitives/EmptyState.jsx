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
      className={`w-full h-full min-h-[250px] flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-white/5 bg-black/20 shadow-inner shadow-white/5 backdrop-blur-sm ${className}`}
    >
      {icon && (
        <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/5 border border-white/10 text-twilight shadow-[0_0_30px_rgba(255,255,255,0.05)] ring-1 ring-white/10" aria-hidden="true">
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            {icon}
          </motion.div>
        </div>
      )}
      <h4 className="text-base font-bold text-white-star mb-2 tracking-wide">{title}</h4>
      {description && (
        <p className="text-sm text-starlight/80 max-w-sm leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={onAction}
          className="mt-6 rounded-xl border border-amethyst/30 bg-amethyst/20 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-amethyst shadow-[0_0_20px_rgba(147,51,234,0.15)] transition-all hover:bg-amethyst/30 hover:shadow-[0_0_25px_rgba(147,51,234,0.25)]"
        >
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  )
}

export default EmptyState
