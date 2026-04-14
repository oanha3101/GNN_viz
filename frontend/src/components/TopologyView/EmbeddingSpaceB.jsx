import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import Plot from 'react-plotly.js'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import { CLASS_COLORS } from '../../utils/colors'

function computeAxisRange(values, paddingRatio = 0.18, minSpan = 6) {
  if (!values?.length) return [-minSpan / 2, minSpan / 2]
  let min = Infinity, max = -Infinity
  values.forEach(v => { if (Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v) } })
  if (!Number.isFinite(min)) return [-minSpan / 2, minSpan / 2]
  const span = Math.max(max - min, minSpan)
  const center = (min + max) / 2
  const half = (span * (1 + paddingRatio)) / 2
  return [center - half, center + half]
}

/**
 * EmbeddingSpaceB — View B for Task 5
 * 
 * Features:
 *   - Tab toggle: [PCA] / [t-SNE]
 *   - N > 2000: subsample 2000 points with tooltip
 *   - Color by label (if available) or cluster (KMeans)
 *   - Trajectory mode (10-epoch trail)
 *   - Isotropy indicator badge
 */
export default function EmbeddingSpaceB() {
  const { snapshots, currentEpochFloat, currentEpoch } = usePlayerStore()
  const graphMeta = useGNNStore(s => s.task5Meta)
  const graphData = useGNNStore(s => s.graphData)
  
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)

  const [projMode, setProjMode] = useState('pca')
  const [showTrajectory, setShowTrajectory] = useState(false)
  const plotContainerRef = useRef(null)

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const hasLabels = graphMeta?.has_labels || false
  const numClasses = graphMeta?.num_classes || 0
  const totalNodes = graphMeta?.num_nodes || graphData?.nodes?.length || 0

  // Get current points based on projection mode
  const rawPoints = useMemo(() => {
    if (!snap) return null
    return projMode === 'tsne' ? snap.tsne_2d : snap.embeddings_2d
  }, [snap, projMode])

  // Subsample indices if N > 2000
  const sampleIndices = useMemo(() => {
    if (!rawPoints) return null
    if (rawPoints.length <= 2000) return null // no subsampling needed
    
    // Deterministic subsample: every k-th + top-degree nodes if available
    const step = Math.ceil(rawPoints.length / 2000)
    const indices = []
    for (let i = 0; i < rawPoints.length; i += step) {
      indices.push(i)
      if (indices.length >= 2000) break
    }
    return indices
  }, [rawPoints])

  const displayPoints = useMemo(() => {
    if (!rawPoints) return null
    if (!sampleIndices) return rawPoints
    return sampleIndices.map(i => rawPoints[i])
  }, [rawPoints, sampleIndices])

  // Trajectory trace
  const trajectoryTrace = useMemo(() => {
    if (!showTrajectory || epochInt < 1 || !displayPoints) return null
    
    const trailLen = Math.min(10, epochInt)
    const numPts = displayPoints.length
    const traces = []

    // Draw trails for a random subset (max 50 nodes for performance)
    const trailCount = Math.min(50, numPts)
    const step = Math.max(1, Math.floor(numPts / trailCount))

    for (let ni = 0; ni < numPts; ni += step) {
      const realIdx = sampleIndices ? sampleIndices[ni] : ni
      const x = [], y = []
      for (let offset = trailLen; offset >= 0; offset--) {
        const idx = epochInt - offset
        if (idx < 0) continue
        const pts = projMode === 'tsne' ? snapshots[idx]?.tsne_2d : snapshots[idx]?.embeddings_2d
        const p = pts?.[realIdx]
        if (p) { x.push(p[0]); y.push(p[1]) }
      }
      if (x.length >= 2) {
        traces.push({
          type: 'scatter', mode: 'lines',
          x, y,
          line: { color: 'rgba(148,163,184,0.15)', width: 1, shape: 'linear' },
          hoverinfo: 'none', showlegend: false,
        })
      }
    }
    return traces
  }, [showTrajectory, epochInt, displayPoints, sampleIndices, snapshots, projMode])

  // Main scatter trace
  const plotData = useMemo(() => {
    if (!displayPoints) return null

    const predictions = snap?.node_predictions || []
    const x = displayPoints.map(p => p[0])
    const y = displayPoints.map(p => p[1])

    const colors = displayPoints.map((_, i) => {
      const realIdx = sampleIndices ? sampleIndices[i] : i
      const pred = predictions[realIdx]
      if (hasLabels && numClasses > 1) {
        const gt = graphData?.nodes?.[realIdx]?.groundTruth ?? pred
        return CLASS_COLORS[gt % CLASS_COLORS.length] || '#94a3b8'
      }
      return CLASS_COLORS[pred % CLASS_COLORS.length] || '#6366f1'
    })

    const sizes = displayPoints.map(() => 6)

    const traces = [{
      type: 'scatter', mode: 'markers',
      x, y,
      marker: {
        color: colors, size: sizes, opacity: 0.8,
        line: { 
          color: displayPoints.map((_, i) => {
            const realIdx = sampleIndices ? sampleIndices[i] : i
            return realIdx === selectedNodeId ? '#ffffff' : 'rgba(255,255,255,0.1)'
          }), 
          width: displayPoints.map((_, i) => {
            const realIdx = sampleIndices ? sampleIndices[i] : i
            return realIdx === selectedNodeId ? 2 : 0.5
          })
        },
      },
      text: displayPoints.map((_, i) => {
        const realIdx = sampleIndices ? sampleIndices[i] : i
        const pred = predictions[realIdx]
        return `Node ${realIdx} | ${hasLabels ? 'Class' : 'Cluster'} ${pred ?? '?'}`
      }),
      hoverinfo: 'text',
    }]

    if (trajectoryTrace) traces.push(...trajectoryTrace)
    return traces
  }, [displayPoints, snap, sampleIndices, hasLabels, numClasses, graphData, trajectoryTrace])

  // Axis config
  const axisConfig = useMemo(() => {
    if (!displayPoints) return { xRange: [-5, 5], yRange: [-5, 5] }
    const x = displayPoints.map(p => p[0])
    const y = displayPoints.map(p => p[1])
    return { xRange: computeAxisRange(x), yRange: computeAxisRange(y) }
  }, [displayPoints])

  // Isotropy value
  const isotropy = snap?.isotropy_score ?? 0

  if (!plotData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="text-3xl mb-2 opacity-40 animate-pulse">📐</div>
          <p className="text-sm">Embedding sẽ xuất hiện khi huấn luyện</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={plotContainerRef} className="w-full h-full relative">
      <Plot
        data={plotData}
        layout={{
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'rgba(15,23,42,0.25)',
          font: { color: '#94a3b8', size: 10 },
          xaxis: {
            showgrid: false, zeroline: false, showticklabels: false,
            range: axisConfig.xRange, fixedrange: false,
          },
          yaxis: {
            showgrid: false, zeroline: false, showticklabels: false,
            range: axisConfig.yRange, fixedrange: false,
            scaleanchor: 'x', scaleratio: 1,
          },
          margin: { l: 12, r: 12, t: 48, b: 28 },
          transition: { duration: 60, easing: 'linear' },
          uirevision: `task5-${projMode}`,
          showlegend: false,
          dragmode: 'pan',
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
        config={{ displayModeBar: false, responsive: true, scrollZoom: true }}
        onClick={(data) => {
          if (data.points?.length > 0) {
            const pt = data.points[0]
            if (pt.curveNumber === 0) { // Only marker scatter
              const pointIdx = pt.pointIndex
              const realIdx = sampleIndices ? sampleIndices[pointIdx] : pointIdx
              setSelectedNode(realIdx)
            }
          }
        }}
      />

      {/* PCA / t-SNE Toggle */}
      <div className="absolute top-8 left-2 z-10 flex gap-1">
        {['pca', 'tsne'].map(mode => (
          <button key={mode}
            onClick={() => setProjMode(mode)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border
              ${projMode === mode
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800/90 text-slate-500 border-slate-700/50 hover:text-slate-300'
              }`}
          >
            {mode === 'pca' ? '📊 PCA' : '🔮 t-SNE'}
          </button>
        ))}
        <button
          onClick={() => setShowTrajectory(!showTrajectory)}
          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all border
            ${showTrajectory
              ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
              : 'bg-slate-800/90 text-slate-500 border-slate-700/50'}`}
        >
          〰️ Trail
        </button>
      </div>

      {/* Isotropy Badge */}
      <div className="absolute top-2 right-2 z-10 bg-slate-900/85 border border-slate-700/40 rounded-lg px-2.5 py-1.5 text-right">
        <span className="text-[8px] text-slate-500 block uppercase tracking-wider">Isotropy</span>
        <span className={`text-sm font-bold font-mono ${
          isotropy > 0.6 ? 'text-green-400' : isotropy > 0.3 ? 'text-yellow-400' : 'text-red-400'
        }`}>
          {(isotropy * 100).toFixed(0)}%
        </span>
      </div>

      {/* Subsample indicator */}
      {sampleIndices && (
        <div className="absolute bottom-2 left-2 bg-slate-900/80 border border-amber-500/30 rounded-lg px-2 py-1 z-10">
          <span className="text-[9px] text-amber-400 font-semibold">
            ⚡ Showing {sampleIndices.length.toLocaleString()} / {totalNodes.toLocaleString()} nodes
          </span>
        </div>
      )}

      {/* Epoch badge */}
      <div className="absolute bottom-2 right-2 bg-slate-900/70 rounded px-2 py-0.5 z-10">
        <span className="text-[9px] text-slate-500">Epoch </span>
        <span className="text-[9px] text-slate-300 font-semibold">{currentEpoch}</span>
      </div>

      {/* Color legend */}
      {hasLabels && numClasses > 1 && (
        <div className="absolute bottom-10 left-2 bg-slate-900/80 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-slate-700/30 z-10">
          <div className="text-[7px] text-slate-500 uppercase tracking-wider font-bold mb-1">Classes</div>
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: Math.min(numClasses, 8) }, (_, c) => (
              <div key={c} className="flex items-center gap-1 text-[8px] text-slate-400">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CLASS_COLORS[c] }} />
                {c}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
