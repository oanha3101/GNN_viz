import React, { useMemo } from 'react'
import { computeHardCases, formatTask2ClassLabel, describeTask2FailureTag } from '../../utils/task2Metrics'
import { translateTask2ReasonTag } from '../../utils/task2ReportI18n'
import EmptyState from '../primitives/EmptyState'

/**
 * Task2HardCases
 *   - Lists the K graphs with the smallest top1-top2 margin.
 *   - Misclassified cases bubble to the top.
 *   - Each card shows: graph ID, true→pred, margin, confidence, reason tag.
 *   - Clicking a row pins it (drives store.selectedNodeId).
 */
export default function Task2HardCases({
  snap,
  graphs,
  classNames,
  k = 10,
  selectedId,
  onSelect,
  lang = 'en',
}) {
  const cases = useMemo(() => computeHardCases(snap, graphs || [], k), [snap, graphs, k])

  // Build a lookup from graph descriptors for failureTag and other metadata
  const descriptorLookup = useMemo(() => {
    const lookup = new Map()
    for (const g of graphs || []) {
      const id = g?.originalGraphId
      if (id != null) lookup.set(id, g)
    }
    return lookup
  }, [graphs])

  if (!cases.length) {
    return (
      <EmptyState
        title="Nothing to diagnose yet"
        description="Once predictions arrive, the tightest decisions show up here."
      />
    )
  }

  const names = classNames?.length ? classNames : []
  const label = (c) => formatTask2ClassLabel(names, c, 'Unknown')
  const isVi = lang === 'vi'

  // Tone for reason tags
  const tagTone = (tag) => {
    switch (tag) {
      case 'overconfident_miss': return 'bad'
      case 'diffuse_readout': return 'warn'
      case 'structural_outlier': return 'warn'
      case 'boundary_case': return 'info'
      case 'stable_win': return 'good'
      default: return 'info'
    }
  }

  const tagPalette = {
    good: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
    warn: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
    bad: 'border-red-500/25 bg-red-500/10 text-red-200',
    info: 'border-line-default/50 bg-white/[0.04] text-slate-300',
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold">
          {isVi ? 'Các ca khó nhất' : 'Hardest cases'}
        </span>
        <span className="text-[10px] text-slate-500">
          {cases.filter((c) => !c.correct).length}/{cases.length} {isVi ? 'sai' : 'wrong'}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[420px] overflow-auto pr-1">
        {cases.map((c) => {
          const isSelected = selectedId === c.id
          const correct = c.correct
          const margin = Math.max(0, Math.min(1, c.margin))
          const confidence = c.confidence ?? null

          // Look up failureTag from descriptor
          const descriptor = descriptorLookup.get(c.id)
          const failureTag = descriptor?.failureTag || describeTask2FailureTag({
            correct: correct ? 1 : 0,
            confidence,
            margin,
            readoutBucket: descriptor?.readoutBucket || 'diffuse',
            entropyBucket: descriptor?.entropyBucket || 'balanced',
            structuralOutlier: descriptor?.structuralOutlier || false,
          })
          const reasonLabel = translateTask2ReasonTag(failureTag, isVi ? 'vi' : 'en')
          const tone = tagTone(failureTag)

          return (
            <div key={c.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect?.(c.id)}
                className={`w-full flex flex-col gap-2 px-3 py-2.5 rounded-xl border text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                  isSelected
                    ? 'border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 to-cyan-500/5 shadow-[0_0_12px_rgba(6,182,212,0.08)]'
                    : 'border-line-subtle/40 hover:border-line-default/60 hover:bg-white/[0.03]'
                }`}
              >
                {/* Top row: ID + badges */}
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-[11px] font-mono font-semibold text-slate-200 shrink-0">G#{c.id}</span>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wide shrink-0 text-center rounded px-1.5 py-0.5 ${
                      correct ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/20 text-red-200'
                    }`}
                  >
                    {correct ? '✓' : '✗'}
                  </span>
                  {/* Reason tag */}
                  <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold shrink-0 ${tagPalette[tone]}`}>
                    {reasonLabel}
                  </span>
                  {/* Confidence badge */}
                  {confidence != null && (
                    <span className={`ml-auto text-[10px] font-mono tabular-nums shrink-0 ${
                      confidence >= 0.75 ? 'text-amber-300' : confidence >= 0.5 ? 'text-slate-300' : 'text-slate-500'
                    }`}>
                      {(confidence * 100).toFixed(0)}% conf
                    </span>
                  )}
                </div>

                {/* Class flow */}
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-slate-400">{isVi ? 'Thật' : 'True'}</span>
                  <span className="font-semibold text-slate-200">{label(c.groundTruth)}</span>
                  <span className="text-slate-600">→</span>
                  <span className="text-slate-400">{isVi ? 'Dự đoán' : 'Pred'}</span>
                  <span className={`font-semibold ${correct ? 'text-emerald-300' : 'text-red-300'}`}>{label(c.predicted)}</span>
                </div>

                {/* Margin bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wide shrink-0">{isVi ? 'Margin' : 'Margin'}</span>
                  <div className="flex-1 h-1.5 bg-slate-950/40 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${correct ? 'bg-gradient-to-r from-emerald-500/80 to-emerald-400/60' : 'bg-gradient-to-r from-red-500/80 to-red-400/60'}`}
                      style={{ width: `${Math.max(4, margin * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums shrink-0 w-8 text-right">
                    {(margin * 100).toFixed(0)}%
                  </span>
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
