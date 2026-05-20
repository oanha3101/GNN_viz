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
            ? 'text-amethyst'
            : 'text-moonlight hover:text-starlight hover:bg-line-default/30'
          }
        `}
        title={collapsed ? label : undefined}
      >
        {active && (
          <motion.div
            layoutId={indicatorId ?? undefined}
            className="absolute inset-0 rounded-xl bg-amethyst/12 ring-1 ring-amethyst/30 z-0"
            transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
          />
        )}
        <div className="relative z-10 flex items-center gap-3 w-full justify-center lg:justify-start">
          <Icon
            size={18}
            strokeWidth={active ? 2.2 : 1.8}
            className={`transition-all ${active ? 'text-amethyst' : 'opacity-80 group-hover:opacity-100'}`}
          />
          {!collapsed && (
            <span className={`text-[11px] font-semibold truncate ${active ? 'text-amethyst' : 'text-starlight/85'}`}>{label}</span>
          )}
        </div>
        {badge !== null && badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-amethyst text-[8px] font-bold text-white px-1 shadow-md">
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
