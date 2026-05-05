export function StatCard({ label, value, tone = 'cyan' }) {
  const toneMap = {
    cyan: 'border-cyan-500/20 bg-cyan-500/8 text-cyan-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-300',
    amber: 'border-amber-500/20 bg-amber-500/8 text-amber-300',
    red: 'border-red-500/20 bg-red-500/8 text-red-300',
  }

  return (
    <div className={`rounded-3xl border p-5 ${toneMap[tone] || toneMap.cyan}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-black text-white">{value}</div>
    </div>
  )
}

export function SectionCard({ title, subtitle, actions, children }) {
  return (
    <div className="rounded-[28px] border border-slate-800/80 bg-slate-950/55 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

export function SelectionButton({ active, onClick, label = 'Select' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
        active
          ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
          : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500/20'
      }`}
    >
      {active ? 'Active' : label}
    </button>
  )
}
