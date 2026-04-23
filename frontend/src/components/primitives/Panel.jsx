import React from 'react'

/**
 * <Panel> — shared chrome for metric / inspector / visualization panels.
 *
 * Replaces ad-hoc <div className="bg-[#050c19] ..."> blocks scattered across
 * TopologyView, MetricsChart, and TaskTopology* components.
 *
 * Props:
 *   - title     : string                  required
 *   - subtitle  : string | ReactNode      optional
 *   - actions   : ReactNode               optional slot at top-right (buttons, tabs)
 *   - footer    : ReactNode               optional slot at bottom
 *   - padding   : 'none' | 'sm' | 'md'    body padding (default 'md')
 *   - className : string                  extra classes on root
 *
 * Example:
 *   <Panel title="Task 1 — Metrics" subtitle="Accuracy over epochs">
 *     <MetricsChart />
 *   </Panel>
 */
export function Panel({
  title,
  subtitle,
  actions,
  footer,
  padding = 'md',
  className = '',
  children,
  ...rest
}) {
  const padMap = { none: '', sm: 'p-2', md: 'p-4' }
  return (
    <section
      className={`flex flex-col h-full bg-panel rounded-lg border border-slate-800/60 overflow-hidden ${className}`}
      {...rest}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-800/60 shrink-0">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[10px] text-slate-500 truncate">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
      <div className={`flex-1 min-h-0 overflow-auto ${padMap[padding]}`}>{children}</div>
      {footer && (
        <footer className="px-4 py-2 border-t border-slate-800/60 shrink-0">{footer}</footer>
      )}
    </section>
  )
}

export default Panel
