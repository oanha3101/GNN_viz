import React, { useMemo } from 'react'
import {
  buildConfidenceHistogram,
  buildDiagnosticsPoints,
} from '../../utils/task2Metrics'
import EmptyState from '../primitives/EmptyState'

/**
 * Task2Diagnostics
 *   - Confidence-distribution histogram split by correct / wrong.
 *   - Scatter: attention-entropy (x) vs graph density (y), coloured by
 *     correctness. Helps spot "model relies on one node for diffuse graphs".
 *
 * Stateless / pure — no D3 / Plotly; uses SVG + divs so the panel stays
 * lightweight and works regardless of container size.
 */
export default function Task2Diagnostics({ snap, graphs, onSelect, selectedId }) {
  const hist = useMemo(() => buildConfidenceHistogram(snap, 10), [snap])
  const points = useMemo(() => buildDiagnosticsPoints(snap, graphs || []), [snap, graphs])

  const hasPoints = points.some((p) => p.density != null)
  const hasConfidences = (snap?.graph_confidences?.length || 0) > 0

  if (!hasPoints && !hasConfidences) {
    return (
      <EmptyState
        title="Diagnostics unavailable"
        description="Live Task 2 snapshots expose entropy, density and confidence metrics after training starts."
      />
    )
  }

  const maxBinCount = Math.max(1, ...hist.map((b) => b.count))

  // Scatter bounds
  const ex = points.map((p) => p.entropy).filter(Number.isFinite)
  const dy = points.map((p) => p.density).filter((v) => v != null && Number.isFinite(v))
  const exMin = ex.length ? Math.min(...ex, 0) : 0
  const exMax = ex.length ? Math.max(...ex, 1) : 1
  const dyMin = dy.length ? Math.min(...dy, 0) : 0
  const dyMax = dy.length ? Math.max(...dy, 1) : 1
  const exRange = Math.max(0.01, exMax - exMin)
  const dyRange = Math.max(0.01, dyMax - dyMin)

  const scatterW = 100
  const scatterH = 100
  const projX = (v) => ((v - exMin) / exRange) * scatterW
  const projY = (v) => scatterH - ((v - dyMin) / dyRange) * scatterH

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Confidence histogram */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-nano uppercase tracking-ultra text-slate-500">
            Confidence distribution
          </h4>
          <span className="text-nano text-slate-600">
            {points.length} graphs · 10 bins
          </span>
        </div>
        <div className="flex items-end gap-0.5 h-24 rounded-md border border-slate-800/60 p-2 bg-slate-950/40">
          {hist.map((b, i) => {
            const correctH = (b.correct / maxBinCount) * 100
            const wrongH = (b.wrong / maxBinCount) * 100
            return (
              <div
                key={i}
                className="flex-1 h-full flex flex-col-reverse gap-px min-w-0"
                title={`Conf ${(b.range[0] * 100).toFixed(0)}–${(b.range[1] * 100).toFixed(0)}% · ${b.count} total · ✓${b.correct} ✗${b.wrong}`}
              >
                <div style={{ height: `${correctH}%` }} className="bg-emerald-500/80 rounded-sm" />
                <div style={{ height: `${wrongH}%` }} className="bg-red-500/80 rounded-sm" />
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

      {/* Entropy × density scatter */}
      {hasPoints && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="text-nano uppercase tracking-ultra text-slate-500">
              Attention entropy × structural density
            </h4>
            <span className="text-nano text-slate-600 font-mono">
              [{exMin.toFixed(2)}, {exMax.toFixed(2)}] · [{dyMin.toFixed(2)}, {dyMax.toFixed(2)}]
            </span>
          </div>
          <div className="relative rounded-md border border-slate-800/60 bg-slate-950/40 p-2">
            <svg viewBox={`-8 -4 ${scatterW + 12} ${scatterH + 16}`} className="w-full h-40" role="img" aria-label="entropy vs density scatter">
              {/* Axes */}
              <line x1="0" y1={scatterH} x2={scatterW} y2={scatterH} stroke="#1e293b" strokeWidth="0.4" />
              <line x1="0" y1="0" x2="0" y2={scatterH} stroke="#1e293b" strokeWidth="0.4" />
              {/* Axis labels */}
              <text x={scatterW / 2} y={scatterH + 10} textAnchor="middle" fill="#64748b" fontSize="4">entropy →</text>
              <text x={-6} y={scatterH / 2} transform={`rotate(-90 -6 ${scatterH / 2})`} textAnchor="middle" fill="#64748b" fontSize="4">density →</text>
              {points.map((p) => {
                if (p.density == null || !Number.isFinite(p.entropy)) return null
                const cx = projX(p.entropy)
                const cy = projY(p.density)
                const fill = p.correct ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.85)'
                const stroke = selectedId === p.id ? '#22d3ee' : 'rgba(15,23,42,0.9)'
                return (
                  <circle
                    key={p.id}
                    cx={cx}
                    cy={cy}
                    r={selectedId === p.id ? 2.6 : 1.8}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth="0.4"
                    onClick={() => onSelect?.(p.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>{`G#${p.id} · entropy ${p.entropy.toFixed(2)} · density ${p.density?.toFixed(2)} · ${p.correct ? '✓' : '✗'}`}</title>
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
