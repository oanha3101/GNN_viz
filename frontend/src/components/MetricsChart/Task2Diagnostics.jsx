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

function buildExplanation(points = []) {
  const sparseDiffuse = points.filter((point) => (
    Number.isFinite(point.entropy) && point.entropy >= 0.7
    && Number.isFinite(point.density) && point.density < 0.2
  ))
  const denseStable = points.filter((point) => (
    point.correct
    && Number.isFinite(point.entropy) && point.entropy < 0.35
    && Number.isFinite(point.density) && point.density >= 0.5
  ))

  if (sparseDiffuse.length) {
    return `${sparseDiffuse.length} sparse, high-entropy graph${sparseDiffuse.length === 1 ? '' : 's'} suggest the model is missing a strong local motif.`
  }
  if (denseStable.length) {
    return `${denseStable.length} dense, low-entropy graph${denseStable.length === 1 ? '' : 's'} behave like stable motif wins.`
  }
  return 'Read entropy, density, and correctness together to decide whether the model is reasoning from one motif or many weak cues.'
}

export default function Task2Diagnostics({
  snap,
  graphs,
  onSelect,
  selectedId,
  selectedCell = null,
}) {
  const hist = useMemo(() => buildConfidenceHistogram(snap, 10), [snap])
  const points = useMemo(() => buildDiagnosticsPoints(snap, graphs || []), [snap, graphs])

  const hasPoints = points.some((point) => point.density != null)
  const hasConfidences = (snap?.graph_confidences?.length || 0) > 0

  if (!hasPoints && !hasConfidences) {
    return (
      <EmptyState
        title="Diagnostics unavailable"
        description="Live Task 2 snapshots expose entropy, density, and confidence metrics after training starts."
      />
    )
  }

  const scopedPoints = selectedCell
    ? points.filter((point) => matchesCell(point, selectedCell))
    : points
  const explanation = buildExplanation(scopedPoints)
  const maxBinCount = Math.max(1, ...hist.map((bin) => bin.count))

  const entropyValues = points.map((point) => point.entropy).filter(Number.isFinite)
  const densityValues = points.map((point) => point.density).filter((value) => value != null && Number.isFinite(value))
  const entropyMin = entropyValues.length ? Math.min(...entropyValues, 0) : 0
  const entropyMax = entropyValues.length ? Math.max(...entropyValues, 1) : 1
  const densityMin = densityValues.length ? Math.min(...densityValues, 0) : 0
  const densityMax = densityValues.length ? Math.max(...densityValues, 1) : 1
  const entropyRange = Math.max(0.01, entropyMax - entropyMin)
  const densityRange = Math.max(0.01, densityMax - densityMin)

  const scatterW = 100
  const scatterH = 100
  const projectX = (value) => ((value - entropyMin) / entropyRange) * scatterW
  const projectY = (value) => scatterH - ((value - densityMin) / densityRange) * scatterH

  return (
    <div
      className="grid gap-4 h-full"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
    >
      <section className="min-w-0">
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-nano uppercase tracking-ultra text-slate-500">
            Confidence distribution
          </h4>
          <span className="text-nano text-slate-600">
            {points.length} graphs · 10 bins
          </span>
        </div>
        <div className="flex items-end gap-0.5 h-24 rounded-md border border-slate-800/60 p-2 bg-slate-950/40">
          {hist.map((bin, index) => {
            const correctHeight = (bin.correct / maxBinCount) * 100
            const wrongHeight = (bin.wrong / maxBinCount) * 100
            return (
              <div
                key={index}
                className="flex-1 h-full flex flex-col-reverse gap-px min-w-0"
                title={`Conf ${(bin.range[0] * 100).toFixed(0)}-${(bin.range[1] * 100).toFixed(0)}% · ${bin.count} total · correct ${bin.correct} · wrong ${bin.wrong}`}
              >
                <div style={{ height: `${correctHeight}%` }} className="bg-emerald-500/80 rounded-sm" />
                <div style={{ height: `${wrongHeight}%` }} className="bg-red-500/80 rounded-sm" />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-nano text-slate-500 font-mono mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
        <div className="flex gap-4 mt-1 text-nano text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />Correct</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" />Wrong</span>
        </div>
      </section>

      {hasPoints && (
        <section className="min-w-0">
          <div className="flex items-baseline justify-between mb-2 gap-3">
            <h4 className="text-nano uppercase tracking-ultra text-slate-500">
              Entropy × density
            </h4>
            <span className="text-nano text-slate-600 font-mono">
              [{entropyMin.toFixed(2)}, {entropyMax.toFixed(2)}] · [{densityMin.toFixed(2)}, {densityMax.toFixed(2)}]
            </span>
          </div>
          <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
            {explanation}
          </p>
          <div className="relative rounded-md border border-slate-800/60 bg-slate-950/40 p-2">
            <svg viewBox={`-8 -4 ${scatterW + 12} ${scatterH + 16}`} className="w-full h-40" role="img" aria-label="entropy vs density scatter">
              <line x1="0" y1={scatterH} x2={scatterW} y2={scatterH} stroke="var(--c-border)" strokeWidth="0.4" />
              <line x1="0" y1="0" x2="0" y2={scatterH} stroke="var(--c-border)" strokeWidth="0.4" />
              <text x={scatterW / 2} y={scatterH + 10} textAnchor="middle" fill="#64748b" fontSize="4">entropy →</text>
              <text x={-6} y={scatterH / 2} transform={`rotate(-90 -6 ${scatterH / 2})`} textAnchor="middle" fill="#64748b" fontSize="4">density →</text>
              {points.map((point) => {
                if (point.density == null || !Number.isFinite(point.entropy)) return null
                const active = selectedId === point.id
                const matched = matchesCell(point, selectedCell)
                const cx = projectX(point.entropy)
                const cy = projectY(point.density)
                const fill = point.correct ? 'rgba(16,185,129,0.78)' : 'rgba(239,68,68,0.82)'
                const opacity = matched ? 1 : 0.18
                const stroke = active ? '#22d3ee' : matched ? 'rgba(15,23,42,0.85)' : 'rgba(71,85,105,0.55)'

                return (
                  <circle
                    key={point.id}
                    cx={cx}
                    cy={cy}
                    r={active ? 2.7 : matched ? 2 : 1.6}
                    fill={fill}
                    fillOpacity={opacity}
                    stroke={stroke}
                    strokeWidth="0.4"
                    onClick={() => onSelect?.(point.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>{`G#${point.id} · entropy ${point.entropy.toFixed(2)} · density ${point.density?.toFixed(2)} · ${point.correct ? 'correct' : 'wrong'}`}</title>
                  </circle>
                )
              })}
            </svg>
          </div>
        </section>
      )}
    </div>
  )
}
