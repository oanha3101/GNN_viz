export function StatCard({ label, value, tone = 'violet', className = '' }) {
  const toneMap = {
    violet: 'border-amethyst/20 bg-amethyst/[0.08] text-moonlight',
    emerald: 'border-aurora-green/20 bg-aurora-green/[0.08] text-aurora-green',
    amber: 'border-aurora-amber/20 bg-aurora-amber/[0.08] text-aurora-amber',
    cyan: 'border-aurora-cyan/20 bg-aurora-cyan/[0.08] text-aurora-cyan',
    red: 'border-aurora-rose/20 bg-aurora-rose/[0.08] text-aurora-rose',
    blue: 'border-aurora-blue/20 bg-aurora-blue/[0.08] text-aurora-blue',
  }

  return (
    <div className={`glass-card stat-card p-5 ${toneMap[tone] || toneMap.violet} ${className}`}>
      <div className="text-micro font-semibold uppercase tracking-ultra text-twilight">{label}</div>
      <div className="mt-3 text-3xl font-black text-white-star">{value}</div>
    </div>
  )
}

export function SectionCard({ title, subtitle, actions, children, className = '' }) {
  return (
    <div className={`glass-card section-card min-w-0 overflow-hidden p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white-star">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-twilight">{subtitle}</div> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

export function SelectionButton({ active, onClick, label = 'Select', disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
        active
          ? 'border-amethyst/30 bg-amethyst/[0.12] text-moonlight glow-violet-sm'
          : disabled
            ? 'border-line-subtle bg-deep text-text-shadow cursor-not-allowed'
            : 'border-line-default bg-deep text-starlight hover:border-line-active hover:bg-dust'
      }`}
    >
      {active ? 'Active' : label}
    </button>
  )
}
