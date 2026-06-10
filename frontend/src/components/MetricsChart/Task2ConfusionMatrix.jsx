import React, { useMemo } from 'react'
import { buildConfusionMatrix } from '../../utils/task2Metrics'
import EmptyState from '../primitives/EmptyState'

/**
 * Task2ConfusionMatrix
 *   - Renders a C × C matrix of graph-classification decisions at the
 *     current epoch, plus per-class precision / recall / F1.
 *   - Rows = predicted class, columns = ground-truth.
 *   - Click a cell to pin a hard-case filter via `onSelectCell(predClass, gtClass)`.
 */
export default function Task2ConfusionMatrix({
  predictions,
  groundTruth,
  classNames,
  onSelectCell,
  selectedCell,
  scopeLabel = 'Focus slice',
}) {
  const cm = useMemo(
    () => buildConfusionMatrix(predictions || [], groundTruth || []),
    [predictions, groundTruth]
  )

  if (!predictions?.length || !groundTruth?.length) {
    return (
      <EmptyState
        title="No predictions yet"
        description="Run training to populate the confusion matrix."
      />
    )
  }

  const classes = cm.classes
  const names = classNames?.length === classes ? classNames : Array.from({ length: classes }, (_, i) => `C${i}`)

  // Color scale for cell intensity (0 -> panel, max -> cyan for diag, error for off-diag)
  let maxCell = 0
  for (let i = 0; i < classes; i++) for (let j = 0; j < classes; j++) if (cm.matrix[i][j] > maxCell) maxCell = cm.matrix[i][j]

  const cellStyle = (pred, gt, val) => {
    const intensity = maxCell > 0 ? val / maxCell : 0
    const isDiag = pred === gt
    const base = isDiag ? '16, 185, 129' : '239, 68, 68' // emerald / red
    return {
      backgroundColor: val === 0 ? 'rgba(30, 41, 59, 0.35)' : `rgba(${base}, ${0.18 + intensity * 0.62})`,
    }
  }

  return (
    <div
      className="grid gap-4 h-full"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
    >
      {/* Matrix */}
      <div className="flex flex-col items-start min-w-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold">
            Confusion Matrix
          </span>
          <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
            {scopeLabel} acc {(cm.accuracy * 100).toFixed(1)}%
          </span>
        </div>
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `auto repeat(${classes}, minmax(56px, 1fr))` }}
        >
          <div />
          {names.map((n, j) => (
            <div key={`gt-${j}`} className="text-nano text-slate-500 text-center uppercase tracking-wide pb-1">
              GT · {n}
            </div>
          ))}
          {cm.matrix.map((row, i) => (
            <React.Fragment key={`row-${i}`}>
              <div className="text-nano text-slate-500 uppercase tracking-wide pr-2 flex items-center justify-end">
                Pred · {names[i]}
              </div>
              {row.map((val, j) => {
                const isActive = selectedCell && selectedCell.pred === i && selectedCell.gt === j
                return (
                  <button
                    type="button"
                    key={`c-${i}-${j}`}
                    onClick={() => onSelectCell?.(i, j)}
                    style={cellStyle(i, j, val)}
                    className={`rounded-lg border text-center py-3 text-xs font-mono font-bold tabular-nums transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                      isActive ? 'border-cyan-400/80 ring-2 ring-cyan-400/40 shadow-[0_0_10px_rgba(34,211,238,0.12)]' : 'border-line-subtle/40 hover:border-line-default/60'
                    } ${i === j ? 'text-emerald-200' : val > 0 ? 'text-red-200' : 'text-slate-500'}`}
                    aria-label={`Predicted ${names[i]} actual ${names[j]}: ${val}`}
                  >
                    {val}
                  </button>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Per-class metrics */}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold mb-3">Per-class</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase tracking-wide text-left">
              <th className="font-normal pb-1">Class</th>
              <th className="font-normal pb-1 text-right">Support</th>
              <th className="font-normal pb-1 text-right">Precision</th>
              <th className="font-normal pb-1 text-right">Recall</th>
              <th className="font-normal pb-1 text-right">F1</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {names.map((n, i) => (
              <tr key={i} className="border-t border-line-subtle/40 hover:bg-white/[0.02] transition-colors">
                <td className="py-1 text-slate-200">{n}</td>
                <td className="py-1 text-right text-slate-400">{cm.support[i]}</td>
                <td className="py-1 text-right text-slate-300">{(cm.precision[i] * 100).toFixed(1)}%</td>
                <td className="py-1 text-right text-slate-300">{(cm.recall[i] * 100).toFixed(1)}%</td>
                <td className="py-1 text-right text-slate-200 font-bold">{(cm.f1[i] * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
