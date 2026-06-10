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
  lang = 'en',
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
  const isVi = lang === 'vi'

  // Color scale for cell intensity
  let maxCell = 0
  for (let i = 0; i < classes; i++) for (let j = 0; j < classes; j++) if (cm.matrix[i][j] > maxCell) maxCell = cm.matrix[i][j]

  const cellStyle = (pred, gt, val) => {
    const intensity = maxCell > 0 ? val / maxCell : 0
    const isDiag = pred === gt
    const base = isDiag ? '16, 185, 129' : '239, 68, 68'
    return {
      backgroundColor: val === 0 ? 'rgba(30, 41, 59, 0.35)' : `rgba(${base}, ${0.18 + intensity * 0.62})`,
    }
  }

  // Count misclassified in this slice
  const misclassifiedCount = predictions.filter((p, i) => p !== groundTruth[i]).length
  const isAllWrong = misclassifiedCount === predictions.length

  return (
    <div className="flex flex-col gap-4">
      {/* Header with accuracy label */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold">
          {isVi ? 'Ma trận nhầm lẫn' : 'Confusion Matrix'}
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
            {isVi ? 'Accuracy trong lát cắt lỗi' : 'Slice accuracy'} {(cm.accuracy * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Context note for error-only slices */}
      {isAllWrong && misclassifiedCount > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[10px] text-amber-200 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          {isVi
            ? 'Lát cắt hiện tại chỉ gồm các ca phân loại sai. Accuracy 0% là đúng kỳ vọng.'
            : 'This slice contains only misclassified cases. 0% accuracy is expected.'}
        </div>
      )}

      {/* Matrix grid + per-class table side by side */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {/* Matrix */}
        <div className="flex flex-col items-start min-w-0">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `auto repeat(${classes}, minmax(64px, 1fr))` }}
          >
            <div />
            {names.map((n, j) => (
              <div key={`gt-${j}`} className="text-[10px] text-slate-500 text-center uppercase tracking-wide pb-1.5 font-semibold">
                GT · {n}
              </div>
            ))}
            {cm.matrix.map((row, i) => (
              <React.Fragment key={`row-${i}`}>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide pr-2 flex items-center justify-end font-semibold">
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
                      className={`rounded-lg border text-center py-3.5 text-xs font-mono font-bold tabular-nums transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
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
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold mb-3">
            {isVi ? 'Chỉ số theo lớp' : 'Per-class metrics'}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-wide text-left border-b border-line-subtle/40">
                  <th className="font-semibold pb-2 pr-3">{isVi ? 'Lớp' : 'Class'}</th>
                  <th className="font-semibold pb-2 pr-3 text-right">{isVi ? 'Số lượng' : 'Support'}</th>
                  <th className="font-semibold pb-2 pr-3 text-right">{isVi ? 'Precision' : 'Precision'}</th>
                  <th className="font-semibold pb-2 pr-3 text-right">{isVi ? 'Recall' : 'Recall'}</th>
                  <th className="font-semibold pb-2 text-right">F1</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {names.map((n, i) => {
                  const isWeak = cm.f1[i] < 0.5
                  return (
                    <tr key={i} className={`border-t border-line-subtle/30 transition-colors ${isWeak ? 'bg-red-500/5' : 'hover:bg-white/[0.02]'}`}>
                      <td className="py-1.5 pr-3 text-slate-200 font-semibold">{n}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-400">{cm.support[i]}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-300">{(cm.precision[i] * 100).toFixed(1)}%</td>
                      <td className="py-1.5 pr-3 text-right text-slate-300">{(cm.recall[i] * 100).toFixed(1)}%</td>
                      <td className={`py-1.5 text-right font-bold ${isWeak ? 'text-red-300' : 'text-slate-200'}`}>
                        {(cm.f1[i] * 100).toFixed(1)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
