import React, { useMemo } from 'react'
import { computeHardCases } from '../../utils/task2Metrics'
import EmptyState from '../primitives/EmptyState'

/**
 * Task2HardCases
 *   - Lists the K graphs with the smallest top1-top2 margin.
 *   - Misclassified cases bubble to the top.
 *   - Clicking a row pins it (drives store.selectedNodeId) so the
 *     TopologyView drill-down opens on the same graph.
 */
export default function Task2HardCases({
  snap,
  graphs,
  classNames,
  k = 10,
  selectedId,
  onSelect,
}) {
  const cases = useMemo(() => computeHardCases(snap, graphs || [], k), [snap, graphs, k])

  if (!cases.length) {
    return (
      <EmptyState
        title="Nothing to diagnose yet"
        description="Once predictions arrive, the tightest decisions show up here."
      />
    )
  }

  const names = classNames?.length ? classNames : null
  const label = (c) => (names && names[c] != null ? names[c] : `C${c}`)

  return (
    <ul
      className="grid gap-1.5"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
    >
      {cases.map((c) => {
        const isSelected = selectedId === c.id
        const correct = c.correct
        const margin = Math.max(0, Math.min(1, c.margin))
        return (
          <li key={c.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect?.(c.id)}
              className={`w-full flex flex-col gap-1 px-2 py-1.5 rounded-md border text-left transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/60 ${
                isSelected
                  ? 'border-cyan-500/60 bg-cyan-500/10'
                  : 'border-slate-800/60 hover:border-slate-600/80 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-nano font-mono text-slate-400 shrink-0">G#{c.id}</span>
                <span
                  className={`text-nano font-bold uppercase tracking-wide shrink-0 text-center rounded-sm px-1 py-0.5 ${
                    correct ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/20 text-red-200'
                  }`}
                  title={correct ? 'Correct but low margin' : 'Misclassified'}
                >
                  {correct ? '✓' : '✗'}
                </span>
                <span className="text-nano text-slate-300 font-mono min-w-0 truncate">
                  {label(c.groundTruth)}<span className="text-slate-500">→</span>{label(c.predicted)}
                </span>
                <span className="ml-auto text-nano font-mono text-slate-400 shrink-0 tabular-nums">
                  {(margin * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${correct ? 'bg-emerald-500/70' : 'bg-red-500/70'}`}
                  style={{ width: `${Math.max(4, margin * 100)}%` }}
                />
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
