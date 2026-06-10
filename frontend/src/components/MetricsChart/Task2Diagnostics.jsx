import React, { useMemo } from 'react'
import {
  buildConfidenceHistogram,
  buildDiagnosticsPoints,
} from '../../utils/task2Metrics'
import EmptyState from '../primitives/EmptyState'

function matchesCell(point, selectedCell) {
  if (!selectedCell) return true
  return point.predicted === selectedCell.pred && point.groundTruth === selectedCell.gt
}

function buildExplanation(points = [], lang = 'en') {
  const sparseDiffuse = points.filter((point) => (
    Number.isFinite(point.entropy) && point.entropy >= 0.7
    && Number.isFinite(point.density) && point.density < 0.2
  ))
  const denseStable = points.filter((point) => (
    point.correct
    && Number.isFinite(point.entropy) && point.entropy < 0.35
    && Number.isFinite(point.density) && point.density >= 0.5
  ))

  if (lang === 'vi') {
    if (sparseDiffuse.length) {
      return `Có ${sparseDiffuse.length} đồ thị thưa và entropy cao, cho thấy mô hình có thể chưa tìm được motif cục bộ đủ mạnh.`
    }
    if (denseStable.length) {
      return `${denseStable.length} đồ thị dày đặc và entropy thấp hoạt động như các motif thắng ổn định.`
    }
    return 'Đọc entropy, mật độ và độ đúng cùng nhau để xác định mô hình đang suy luận từ một motif hay nhiều tín hiệu yếu.'
  }

  if (sparseDiffuse.length) {
    return `${sparseDiffuse.length} sparse, high-entropy graph${sparseDiffuse.length === 1 ? '' : 's'} suggest the model is missing a strong local motif.`
  }
  if (denseStable.length) {
    return `${denseStable.length} dense, low-entropy graph${denseStable.length === 1 ? '' : 's'} behave like stable motif wins.`
  }
  return 'Read entropy, density, and correctness together to decide whether the model is reasoning from one motif or many weak cues.'
}

function buildConfidenceInsight(hist, lang = 'en') {
  const totalCorrect = hist.reduce((sum, bin) => sum + bin.correct, 0)
  const totalWrong = hist.reduce((sum, bin) => sum + bin.wrong, 0)
  const highConfCorrect = hist.filter((bin) => bin.range[0] >= 0.7).reduce((sum, bin) => sum + bin.correct, 0)
  const midConfWrong = hist.filter((bin) => bin.range[0] >= 0.4 && bin.range[1] <= 0.8).reduce((sum, bin) => sum + bin.wrong, 0)

  if (lang === 'vi') {
    if (totalCorrect > 0 && highConfCorrect > totalCorrect * 0.5) {
      return `Dự đoán đúng tập trung ở vùng confidence cao; ${midConfWrong > 0 ? `các cột đỏ cho thấy vẫn còn lỗi ở vùng tự tin trung bình-cao.` : 'phân bố nhìn chung sạch.'}`
    }
    return `Có ${totalWrong} đồ thị sai trong tổng số ${totalCorrect + totalWrong}. ${midConfWrong > 0 ? `${midConfWrong} lỗi nằm ở vùng confidence trung bình-cao.` : ''}`
  }

  if (totalCorrect > 0 && highConfCorrect > totalCorrect * 0.5) {
    return `Correct predictions cluster at high confidence; ${midConfWrong > 0 ? 'red bars show errors still linger in the mid-high confidence range.' : 'the distribution is mostly clean.'}`
  }
  return `${totalWrong} wrong out of ${totalCorrect + totalWrong} graphs. ${midConfWrong > 0 ? `${midConfWrong} errors sit in the mid-high confidence range.` : ''}`
}

export default function Task2Diagnostics({
  snap,
  graphs,
  onSelect,
  selectedId,
  selectedCell = null,
  lang = 'en',
}) {
  const isVi = lang === 'vi'
  const hist = useMemo(() => buildConfidenceHistogram(snap, 10), [snap])
  const points = useMemo(() => buildDiagnosticsPoints(snap, graphs || []), [snap, graphs])

  const hasPoints = points.some((point) => point.density != null)
  const hasConfidences = (snap?.graph_confidences?.length || 0) > 0

  if (!hasPoints && !hasConfidences) {
    return (
      <EmptyState
        title={isVi ? 'Chưa có dữ liệu chẩn đoán' : 'Diagnostics unavailable'}
        description={isVi ? 'Snapshot Task 2 sẽ hiển thị entropy, mật độ và confidence sau khi huấn luyện bắt đầu.' : 'Live Task 2 snapshots expose entropy, density, and confidence metrics after training starts.'}
      />
    )
  }

  const scopedPoints = selectedCell
    ? points.filter((point) => matchesCell(point, selectedCell))
    : points
  const explanation = buildExplanation(scopedPoints, lang)
  const confidenceInsight = buildConfidenceInsight(hist, lang)
  const maxBinCount = Math.max(1, ...hist.map((bin) => bin.count))

  const entropyValues = points.map((point) => point.entropy).filter(Number.isFinite)
  const densityValues = points.map((point) => point.density).filter((value) => value != null && Number.isFinite(value))
  const entropyMin = entropyValues.length ? Math.min(...entropyValues, 0) : 0
  const entropyMax = entropyValues.length ? Math.max(...entropyValues, 1) : 1
  const densityMin = densityValues.length ? Math.min(...densityValues, 0) : 0
  const densityMax = densityValues.length ? Math.max(...densityValues, 1) : 1
  const entropyRange = Math.max(0.01, entropyMax - entropyMin)
  const densityRange = Math.max(0.01, densityMax - densityMin)

  const scatterW = 120
  const scatterH = 100
  const projectX = (value) => ((value - entropyMin) / entropyRange) * scatterW
  const projectY = (value) => scatterH - ((value - densityMin) / densityRange) * scatterH

  // Count sparse+high-entropy for highlighting
  const sparseHighEntropyIds = new Set(
    points
      .filter((p) => Number.isFinite(p.entropy) && p.entropy >= 0.7 && Number.isFinite(p.density) && p.density < 0.2)
      .map((p) => p.id)
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Confidence distribution */}
      <section className="min-w-0">
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">
            {isVi ? 'Phân bố confidence' : 'Confidence distribution'}
          </h4>
          <span className="text-[10px] text-slate-600 font-medium">
            {points.length} {isVi ? 'đồ thị' : 'graphs'} · 10 bins
          </span>
        </div>
        <div className="flex items-end gap-0.5 h-28 rounded-xl border border-line-subtle/40 p-2.5 bg-gradient-to-b from-deep/60 to-deep/30">
          {hist.map((bin, index) => {
            const correctHeight = (bin.correct / maxBinCount) * 100
            const wrongHeight = (bin.wrong / maxBinCount) * 100
            return (
              <div
                key={index}
                className="flex-1 h-full flex flex-col-reverse gap-px min-w-0"
                title={`${isVi ? 'Confidence' : 'Conf'} ${(bin.range[0] * 100).toFixed(0)}-${(bin.range[1] * 100).toFixed(0)}% · ${bin.count} ${isVi ? 'tổng' : 'total'} · ${isVi ? 'đúng' : 'correct'} ${bin.correct} · ${isVi ? 'sai' : 'wrong'} ${bin.wrong}`}
              >
                <div style={{ height: `${correctHeight}%` }} className="bg-emerald-500/80 rounded-sm" />
                <div style={{ height: `${wrongHeight}%` }} className="bg-red-500/80 rounded-sm" />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
        <div className="flex items-center gap-4 mt-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-2 h-2 rounded-sm bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]" />
            {isVi ? 'Đúng' : 'Correct'}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-2 h-2 rounded-sm bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]" />
            {isVi ? 'Sai' : 'Wrong'}
          </div>
        </div>
        {/* Confidence insight */}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{confidenceInsight}</p>
      </section>

      {/* Entropy × Density scatter */}
      {hasPoints && (
        <section className="min-w-0">
          <div className="flex items-baseline justify-between mb-2 gap-3">
            <h4 className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">
              {isVi ? 'Entropy × Mật độ' : 'Entropy × Density'}
            </h4>
            <span className="text-[10px] text-slate-600 font-mono font-medium">
              [{entropyMin.toFixed(2)}, {entropyMax.toFixed(2)}] · [{densityMin.toFixed(2)}, {densityMax.toFixed(2)}]
            </span>
          </div>
          <p className="mb-2.5 text-[11px] leading-relaxed text-slate-400">
            {explanation}
          </p>
          <div className="relative rounded-xl border border-line-subtle/40 bg-gradient-to-b from-deep/60 to-deep/30 p-3">
            <svg viewBox={`-12 -6 ${scatterW + 20} ${scatterH + 20}`} className="w-full h-52" role="img" aria-label={isVi ? 'entropy vs mật độ scatter' : 'entropy vs density scatter'}>
              {/* Grid lines */}
              {[0.25, 0.5, 0.75].map((frac) => (
                <React.Fragment key={frac}>
                  <line x1={scatterW * frac} y1="0" x2={scatterW * frac} y2={scatterH} stroke="rgba(100,116,139,0.12)" strokeWidth="0.3" strokeDasharray="1.5 1.5" />
                  <line x1="0" y1={scatterH * frac} x2={scatterW} y2={scatterH * frac} stroke="rgba(100,116,139,0.12)" strokeWidth="0.3" strokeDasharray="1.5 1.5" />
                </React.Fragment>
              ))}
              {/* Axes */}
              <line x1="0" y1={scatterH} x2={scatterW} y2={scatterH} stroke="var(--c-border)" strokeWidth="0.5" />
              <line x1="0" y1="0" x2="0" y2={scatterH} stroke="var(--c-border)" strokeWidth="0.5" />
              {/* Axis labels */}
              <text x={scatterW / 2} y={scatterH + 14} textAnchor="middle" fill="#94a3b8" fontSize="4.5" fontWeight="600">
                {isVi ? 'Entropy →' : 'Entropy →'}
              </text>
              <text x={-10} y={scatterH / 2} transform={`rotate(-90 -10 ${scatterH / 2})`} textAnchor="middle" fill="#94a3b8" fontSize="4.5" fontWeight="600">
                {isVi ? 'Mật độ ↑' : 'Density ↑'}
              </text>
              {/* Axis tick labels */}
              <text x="0" y={scatterH + 5} textAnchor="middle" fill="#475569" fontSize="3.5">{entropyMin.toFixed(1)}</text>
              <text x={scatterW} y={scatterH + 5} textAnchor="middle" fill="#475569" fontSize="3.5">{entropyMax.toFixed(1)}</text>
              <text x="-3" y={scatterH} textAnchor="end" fill="#475569" fontSize="3.5">{densityMin.toFixed(1)}</text>
              <text x="-3" y="0" textAnchor="end" fill="#475569" fontSize="3.5" dominantBaseline="middle">{densityMax.toFixed(1)}</text>
              {/* Data points */}
              {points.map((point) => {
                if (point.density == null || !Number.isFinite(point.entropy)) return null
                const active = selectedId === point.id
                const matched = matchesCell(point, selectedCell)
                const isSparseHighEntropy = sparseHighEntropyIds.has(point.id)
                const cx = projectX(point.entropy)
                const cy = projectY(point.density)
                const fill = point.correct ? 'rgba(16,185,129,0.78)' : 'rgba(239,68,68,0.82)'
                const opacity = matched ? 1 : 0.15
                const stroke = active ? '#22d3ee' : isSparseHighEntropy ? '#f59e0b' : matched ? 'rgba(15,23,42,0.85)' : 'rgba(71,85,105,0.55)'
                const r = active ? 3.5 : isSparseHighEntropy ? 2.8 : matched ? 2.2 : 1.5

                return (
                  <circle
                    key={point.id}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={fill}
                    fillOpacity={opacity}
                    stroke={stroke}
                    strokeWidth={active || isSparseHighEntropy ? 0.8 : 0.4}
                    onClick={() => onSelect?.(point.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>{`G#${point.id} · entropy ${point.entropy.toFixed(2)} · ${isVi ? 'mật độ' : 'density'} ${point.density?.toFixed(2)} · ${point.correct ? (isVi ? 'đúng' : 'correct') : (isVi ? 'sai' : 'wrong')} · conf ${((point.confidence || 0) * 100).toFixed(0)}%`}</title>
                  </circle>
                )
              })}
            </svg>
            {/* Legend */}
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 border border-emerald-400/40" />
                {isVi ? 'Đúng' : 'Correct'}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 border border-red-400/40" />
                {isVi ? 'Sai' : 'Wrong'}
              </div>
              {sparseHighEntropyIds.size > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 bg-transparent" />
                  {isVi ? 'Thưa + entropy cao' : 'Sparse + high entropy'}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
