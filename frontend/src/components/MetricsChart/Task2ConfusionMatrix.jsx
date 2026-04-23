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
    <div className="flex flex-col gap-4 h-full">
      {/* Matrix */}
      <div className="flex flex-col items-start">
        <div className="text-nano uppercase tracking-ultra text-slate-500 mb-2">
          Confusion Matrix · Overall acc {(cm.accuracy * 100).toFixed(1)}%
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
                    className={`rounded-md border text-center py-3 text-xs font-mono font-bold tabular-nums transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/60 ${
                      isActive ? 'border-cyan-400 ring-2 ring-cyan-400/60' : 'border-slate-800/60 hover:border-slate-600/80'
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
      <div>
        <div className="text-nano uppercase tracking-ultra text-slate-500 mb-2">Per-class</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-nano text-slate-500 uppercase tracking-wide text-left">
              <th className="font-normal pb-1">Class</th>
              <th className="font-normal pb-1 text-right">Support</th>
              <th className="font-normal pb-1 text-right">Precision</th>
              <th className="font-normal pb-1 text-right">Recall</th>
              <th className="font-normal pb-1 text-right">F1</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {names.map((n, i) => (
              <tr key={i} className="border-t border-slate-800/60">
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
