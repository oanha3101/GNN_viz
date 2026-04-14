/**
 * Sidebar icon button with tooltip when collapsed.
 */
export default function SidebarButton({
  icon: Icon,
  label,
  active = false,
  collapsed = true,
  badge = null,
  onClick,
}) {
  return (
    <div className="tooltip-container relative">
      <button
        onClick={onClick}
        className={`
          flex items-center gap-3 w-full rounded-xl transition-all duration-200
          ${collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'}
          ${active
            ? 'bg-cyan-500/15 text-cyan-400 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]'
            : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60'
          }
        `}
        title={collapsed ? label : undefined}
      >
        <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
        {!collapsed && (
          <span className="text-[11px] font-semibold truncate">{label}</span>
        )}
        {badge !== null && badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-cyan-500 text-[8px] font-bold text-slate-950 px-1">
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
