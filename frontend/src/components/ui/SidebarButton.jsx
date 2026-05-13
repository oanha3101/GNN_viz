/**
 * Sidebar icon button with tooltip when collapsed.
 */
import { motion } from 'framer-motion'
export default function SidebarButton({
  icon: Icon,
  label,
  active = false,
  collapsed = true,
  badge = null,
  onClick,
  indicatorId = null,
}) {
  return (
    <div className="tooltip-container relative">
      <button
        onClick={onClick}
        className={`
          relative flex items-center gap-3 w-full rounded-xl transition-all duration-300 group hover:scale-[1.02] active:scale-95
          ${collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'}
          ${active
            ? 'text-white'
            : 'text-starlight/50 hover:text-white hover:bg-white/5'
          }
        `}
        title={collapsed ? label : undefined}
      >
        {active && (
          <motion.div
            layoutId={indicatorId ?? undefined}
            className="absolute inset-0 rounded-xl bg-[#6b21a8]/70 z-0"
            transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
          />
        )}
        <div className="relative z-10 flex items-center gap-3 w-full justify-center lg:justify-start">
          <Icon
            size={18}
            strokeWidth={active ? 2.2 : 1.8}
            className={`transition-all ${active ? 'opacity-90' : 'group-hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]'}`}
          />
          {!collapsed && (
            <span className="text-[11px] font-semibold truncate text-white/85">{label}</span>
          )}
        </div>
        {badge !== null && badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-amethyst text-[8px] font-bold text-white px-1 shadow-[0_0_8px_rgba(147,51,234,0.6)]">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
      {collapsed && (
        <div className="tooltip-content">{label}</div>
      )}
    </div>
  )
}
