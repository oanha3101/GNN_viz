import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import LazyPlot from '../primitives/LazyPlot'
import { getClassColor } from '../../utils/colors'
import { easeInOutCubic, interpolateSnapshots } from '../../engine/interpolate'
import { buildTask2GraphDescriptors } from '../../utils/task2Metrics'

function getSpreadStats(points = []) {
  if (!points.length) {
    return { xRange: [-3, 3], yRange: [-3, 3], compactness: 1 }
  }

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  points.forEach(([x, y]) => {
    if (Number.isFinite(x)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x) }
    if (Number.isFinite(y)) { minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  })

  if (!Number.isFinite(minX)) return { xRange: [-3, 3], yRange: [-3, 3], compactness: 1 }

  const spanX = Math.max(maxX - minX, 0.5)
  const spanY = Math.max(maxY - minY, 0.5)
  const maxSpan = Math.max(spanX, spanY)
  const padding = maxSpan * 0.25
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const compactness = Math.max(0.4, Math.min(1.3, 4 / maxSpan))

  return {
    xRange: [centerX - maxSpan / 2 - padding, centerX + maxSpan / 2 + padding],
    yRange: [centerY - maxSpan / 2 - padding, centerY + maxSpan / 2 + padding],
    compactness,
  }
}

function colorByMode(descriptor, mode) {
  if (mode === 'correctness') {
    return descriptor.correct === 1 ? '#10b981' : '#ef4444'
  }
  if (mode === 'confidence') {
    const confidence = descriptor.confidence ?? 0
    return confidence > 0.8 ? '#f8fafc' : confidence > 0.55 ? '#f59e0b' : '#ef4444'
  }
  if (mode === 'entropy') {
    const entropy = descriptor.entropy ?? 0
    return entropy >= 0.7 ? '#fb7185' : entropy >= 0.35 ? '#f59e0b' : '#22d3ee'
  }
  return getClassColor(descriptor.predicted)
}

function MiniGraphPopup({ descriptor, currSnap, position }) {
  if (!descriptor || !position) return null
  const { nodes, links } = descriptor
  const size = 100
  const radius = 35
  const centerX = 50
  const centerY = 50

  const nodePos = {}
  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2
    nodePos[node.id] = { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) }
  })

  return (
    <div className="fixed z-[9999] pointer-events-none" style={{ left: position.x + 16, top: position.y - 60 }}>
      <div className="bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-600/60 shadow-2xl shadow-black/50 p-2 w-[180px]">
        <svg width="100" height="100" viewBox="0 0 100 100" className="mx-auto">
          {links.map((link, index) => {
            const source = typeof link.source === 'object' ? link.source.id : link.source
            const target = typeof link.target === 'object' ? link.target.id : link.target
            return nodePos[source] && nodePos[target] ? (
              <line
                key={index}
                x1={nodePos[source].x}
                y1={nodePos[source].y}
                x2={nodePos[target].x}
                y2={nodePos[target].y}
                stroke="rgba(148,163,184,0.2)"
                strokeWidth="1"
              />
            ) : null
          })}
          {nodes.map((node) => (
            nodePos[node.id] ? (
              <circle
                key={node.id}
                cx={nodePos[node.id].x}
                cy={nodePos[node.id].y}
                r="4"
                fill="#6366f1"
              />
            ) : null
          ))}
        </svg>
        <div className="mt-1 space-y-0.5 text-center text-[7px] leading-tight text-slate-400">
          <div>G#{descriptor.originalGraphId} · {nodes.length}n/{links.length}e</div>
          <div>{descriptor.motifSignature}</div>
          <div>{descriptor.failureTag}</div>
        </div>
      </div>
    </div>
  )
}

export default function EmbeddingView({
  forcedTask2ColorMode = null,
  forcedTask2SelectedCell = null,
  hideTask2Toolbar = false,
}) {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const selectedTask = useGNNStore((state) => state.selectedTask)
  const selectedNodeId = useGNNStore((state) => state.selectedNodeId)
  const setSelectedNode = useGNNStore((state) => state.setSelectedNode)
  const setHoveredGraph = useGNNStore((state) => state.setHoveredGraph)
  const hoveredGraphId = useGNNStore((state) => state.hoveredGraphId)
  const taskData = useGNNStore((state) => state.taskData)
  const graphColorMode = useGNNStore((state) => state.task2EmbeddingColorMode)
  const setGraphColorMode = useGNNStore((state) => state.setTask2EmbeddingColorMode)
  const selectedCell = useGNNStore((state) => state.task2SelectedCell)
  const activeGraphColorMode = forcedTask2ColorMode || graphColorMode
  const resolvedSelectedCell = forcedTask2SelectedCell ?? selectedCell

  const [showTrajectory, setShowTrajectory] = useState(false)
  const [popupPos, setPopupPos] = useState(null)
  const plotContainerRef = useRef(null)

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const tRaw = currentEpochFloat - epochInt
  const t = easeInOutCubic(Math.max(0, Math.min(1, tRaw)))

  const snapA = snapshots[epochInt]
  const snapB = snapshots[epochInt + 1] || snapA

  const currSnap = useMemo(() => {
    if (!snapA || !snapB) return null
    return interpolateSnapshots(snapA, snapB, t)
  }, [snapA, snapB, t])

  const indexedGraphs = useMemo(
    () => (taskData?.graphs || []).map((graph, index) => ({
      ...graph,
      originalGraphId: graph?.originalGraphId ?? index,
      sourceIndex: graph?.sourceIndex ?? index,
    })),
    [taskData?.graphs]
  )

  const task2Descriptors = useMemo(() => {
    if (selectedTask !== 2) return []
    return buildTask2GraphDescriptors({
      snapshot: currSnap,
      graphs: indexedGraphs,
      classNames: taskData?.classNames || [],
    })
  }, [selectedTask, currSnap, indexedGraphs, taskData?.classNames])

  const task2DescriptorByGraphId = useMemo(() => {
    const map = new Map()
    task2Descriptors.forEach((descriptor) => {
      map.set(descriptor.originalGraphId, descriptor)
    })
    return map
  }, [task2Descriptors])

  const trajectoryTrace = useMemo(() => {
    if (!showTrajectory || selectedNodeId === null || !currSnap?.embeddings_2d) return null
    if (selectedTask === 2 || selectedTask === 3) return null

    const trailLen = Math.min(10, epochInt)
    const x = []
    const y = []
    for (let offset = trailLen; offset >= 0; offset--) {
      const idx = epochInt - offset
      if (idx < 0) continue
      const emb = snapshots[idx]?.embeddings_2d?.[selectedNodeId]
      if (emb) {
        x.push(emb[0])
        y.push(emb[1])
      }
    }

    if (x.length < 2) return null
    return {
      type: 'scatter',
      mode: 'lines+markers',
      x,
      y,
      line: { color: 'rgba(251, 146, 60, 0.5)', width: 2, shape: 'spline' },
      marker: {
        color: x.map((_, index) => `rgba(251, 146, 60, ${0.2 + (index / x.length) * 0.8})`),
        size: x.map((_, index) => 3 + (index / x.length) * 4),
      },
      hoverinfo: 'none',
      showlegend: false,
    }
  }, [showTrajectory, selectedNodeId, epochInt, snapshots, currSnap, selectedTask])

  const plotData = useMemo(() => {
    if (!currSnap) return null

    if (selectedTask === 2 && currSnap.graph_embeddings_2d) {
      const emb = currSnap.graph_embeddings_2d
      const { compactness } = getSpreadStats(emb)
      const x = emb.map((point) => point[0])
      const y = emb.map((point) => point[1])
      const descriptors = task2Descriptors.length ? task2Descriptors : indexedGraphs.map((graph, index) => ({
        originalGraphId: graph.originalGraphId,
        sourceIndex: graph.sourceIndex,
        predicted: currSnap.graph_predictions?.[index] ?? null,
        confidence: currSnap.graph_confidences?.[index] ?? 0,
        correct: currSnap.graph_correct?.[index] ?? null,
        entropy: currSnap.attention_entropy?.[index] ?? 0,
      }))
      const selectedCellSet = resolvedSelectedCell
        ? new Set(descriptors.filter((descriptor) => descriptor.predicted === resolvedSelectedCell.pred && descriptor.groundTruth === resolvedSelectedCell.gt).map((descriptor) => descriptor.originalGraphId))
        : null
      const colors = descriptors.map((descriptor) => colorByMode(descriptor, activeGraphColorMode))
      const sizes = descriptors.map((descriptor) => {
        const selected = descriptor.originalGraphId === selectedNodeId
        return selected ? 14 * compactness : 8 * compactness
      })
      const opacities = descriptors.map((descriptor) => {
        if (!selectedCellSet) return 0.85
        return selectedCellSet.has(descriptor.originalGraphId) ? 1 : 0.18
      })

      return [{
        type: 'scatter',
        mode: 'markers+text',
        x,
        y,
        text: descriptors.map((descriptor) => `G${descriptor.originalGraphId}`),
        textposition: 'top center',
        textfont: { family: 'monospace', size: 9, color: '#94a3b8' },
        marker: {
          color: colors,
          size: sizes,
          opacity: opacities,
          line: {
            color: descriptors.map((descriptor) => (descriptor.originalGraphId === selectedNodeId ? 'white' : 'rgba(255,255,255,0.08)')),
            width: descriptors.map((descriptor) => (descriptor.originalGraphId === selectedNodeId ? 2 : 0.5)),
          },
        },
        hoverinfo: 'none',
      }]
    }

    if (selectedTask === 3 && currSnap.embeddings_2d && taskData?.testEdges) {
      const emb = currSnap.embeddings_2d
      const scores = currSnap.edge_scores || []
      const { compactness } = getSpreadStats(emb)
      const x = []
      const y = []
      const colors = []
      const labels = []
      const sizes = []
      const opacities = []

      taskData.testEdges.forEach((edge, index) => {
        const source = emb[edge.source]
        const target = emb[edge.target]
        if (source && target) {
          const score = scores[index] ?? 0.5
          x.push((source[0] + target[0]) / 2)
          y.push((source[1] + target[1]) / 2)
          colors.push(edge.exists ? '#10b981' : '#ef4444')
          sizes.push((7 + score * 7) * compactness)
          opacities.push(0.5 + score * 0.5)
          labels.push(`${edge.source}-${edge.target}`)
        }
      })

      return [{
        type: 'scatter',
        mode: 'markers+text',
        x,
        y,
        text: labels,
        textposition: 'top center',
        textfont: { family: 'monospace', size: 8, color: '#64748b' },
        marker: {
          color: colors,
          size: sizes,
          opacity: opacities,
          line: { color: 'rgba(255,255,255,0.2)', width: 1 },
        },
        hoverinfo: 'text',
      }]
    }

    if (!currSnap?.embeddings_2d) return null
    const emb = currSnap.embeddings_2d
    const preds = currSnap.node_predictions || []
    const { compactness } = getSpreadStats(emb)
    const x = emb.map((point) => point[0])
    const y = emb.map((point) => point[1])
    const colors = preds.map((classId) => getClassColor(classId))
    const sizes = emb.map((_, index) => index === selectedNodeId ? 14 * compactness : 8 * compactness)
    const opacities = emb.map((_, index) => index === selectedNodeId ? 1 : 0.82)

    const traces = [{
      type: 'scatter',
      mode: 'markers+text',
      x,
      y,
      text: emb.map((_, index) => String(index)),
      textposition: 'top center',
      textfont: { family: 'monospace', size: 9, color: '#ffffff' },
      marker: {
        color: colors,
        size: sizes,
        opacity: opacities,
        line: {
          color: emb.map((_, index) => index === selectedNodeId ? 'white' : 'rgba(255,255,255,0.08)'),
          width: emb.map((_, index) => index === selectedNodeId ? 2 : 0.5),
        },
      },
      hoverinfo: 'text',
    }]

    if (trajectoryTrace) traces.push(trajectoryTrace)
    return traces
  }, [currSnap, selectedNodeId, selectedTask, taskData, trajectoryTrace, activeGraphColorMode, resolvedSelectedCell, indexedGraphs, task2Descriptors])

  const silhouetteScore = useMemo(() => {
    const snapToUse = selectedTask === 2
      ? { emb: currSnap?.graph_embeddings_2d, preds: currSnap?.graph_predictions }
      : { emb: currSnap?.embeddings_2d, preds: currSnap?.node_predictions }

    if (!snapToUse.emb || !snapToUse.preds) return 0
    const { emb, preds } = snapToUse
    const classes = [...new Set(preds)]
    if (classes.length <= 1 || emb.length < 4) return 0

    const sampleSize = Math.min(emb.length, 30)
    let totalScore = 0
    let count = 0

    for (let i = 0; i < sampleSize; i++) {
      const ci = preds[i]
      let intra = 0
      let intraCount = 0
      let inter = Infinity

      for (let j = 0; j < emb.length; j++) {
        if (i === j) continue
        const distance = Math.hypot(emb[i][0] - emb[j][0], emb[i][1] - emb[j][1])
        if (preds[j] === ci) {
          intra += distance
          intraCount++
        }
      }
      intra = intraCount > 0 ? intra / intraCount : 0

      for (const cls of classes) {
        if (cls === ci) continue
        let dist = 0
        let cnt = 0
        for (let j = 0; j < emb.length; j++) {
          if (preds[j] === cls) {
            dist += Math.hypot(emb[i][0] - emb[j][0], emb[i][1] - emb[j][1])
            cnt++
          }
        }
        if (cnt > 0) inter = Math.min(inter, dist / cnt)
      }

      const s = inter > 0 ? (inter - intra) / Math.max(inter, intra) : 0
      totalScore += s
      count++
    }
    return count > 0 ? totalScore / count : 0
  }, [currSnap, selectedTask])

  const handlePointClick = useCallback((event) => {
    if (event.points && event.points.length > 0) {
      const point = event.points[0]
      const idx = point.pointIndex
      if (selectedTask === 2) {
        const descriptor = task2Descriptors[idx]
        if (descriptor) {
          setSelectedNode(descriptor.originalGraphId)
          return
        }
      }
      setSelectedNode(idx)
      if (selectedTask === 1) setShowTrajectory(true)
    }
  }, [setSelectedNode, selectedTask, task2Descriptors])

  const handleHover = useCallback((event) => {
    if (event.points && event.points.length > 0) {
      const point = event.points[0]
      if (selectedTask === 2) {
        const descriptor = task2Descriptors[point.pointIndex]
        setHoveredGraph(descriptor?.originalGraphId ?? null)
        setPopupPos({ x: (event.event?.clientX || 0), y: (event.event?.clientY || 0) })
      }
    }
  }, [selectedTask, setHoveredGraph, task2Descriptors])

  const handleUnhover = useCallback(() => {
    if (selectedTask === 2) {
      setHoveredGraph(null)
      setPopupPos(null)
    }
  }, [selectedTask, setHoveredGraph])

  const hoveredDescriptor = useMemo(() => {
    if (selectedTask !== 2 || hoveredGraphId === null) return null
    return task2DescriptorByGraphId.get(hoveredGraphId) || null
  }, [selectedTask, hoveredGraphId, task2DescriptorByGraphId])

  const axisConfig = useMemo(() => {
    if (selectedTask === 2) return getSpreadStats(currSnap?.graph_embeddings_2d || [])
    return getSpreadStats(currSnap?.embeddings_2d || [])
  }, [currSnap, selectedTask])

  if (!plotData) {
    return <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-950/20 animate-pulse text-[10px] uppercase font-black tracking-widest">Awaiting Latent...</div>
  }

  return (
    <div ref={plotContainerRef} className="w-full h-full relative bg-[#020617]/40">
      {selectedTask === 2 && !hideTask2Toolbar && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-950/80 px-2 py-1 text-[10px] font-semibold text-slate-300">
          <span className="uppercase tracking-ultra text-slate-500">Color</span>
          {[
            ['predicted', 'Predicted'],
            ['correctness', 'Correct'],
            ['confidence', 'Confidence'],
            ['entropy', 'Entropy'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGraphColorMode(mode)}
              className={`rounded-md px-2 py-1 transition-colors ${
                activeGraphColorMode === mode
                  ? 'bg-cyan-500/12 text-cyan-200'
                  : 'text-slate-500 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <LazyPlot
        data={plotData}
        layout={{
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#94a3b8', size: 10 },
          xaxis: {
            showgrid: true,
            gridcolor: 'rgba(255,255,255,0.02)',
            zeroline: false,
            showticklabels: false,
            range: axisConfig.xRange,
            fixedrange: false,
          },
          yaxis: {
            showgrid: true,
            gridcolor: 'rgba(255,255,255,0.02)',
            zeroline: false,
            showticklabels: false,
            range: axisConfig.yRange,
            fixedrange: false,
            scaleanchor: 'x',
            scaleratio: 1,
          },
          margin: { l: 30, r: 30, t: 40, b: 30 },
          uirevision: `gnn-embed-${selectedTask}-${activeGraphColorMode}`,
          showlegend: false,
          dragmode: 'pan',
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
        config={{ displayModeBar: false, responsive: true, scrollZoom: true }}
        onClick={handlePointClick}
        onHover={handleHover}
        onUnhover={handleUnhover}
      />

      <div className="absolute top-2 right-2 bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2 border border-white/5 shadow-2xl text-right pointer-events-none">
        <span className="text-[8px] text-slate-500 block uppercase font-black tracking-widest">Silhouette</span>
        <span className={`text-sm font-black font-mono ${silhouetteScore > 0.45 ? 'text-emerald-400' : silhouetteScore > 0.2 ? 'text-amber-400' : 'text-rose-400'}`}>
          {silhouetteScore.toFixed(3)}
        </span>
      </div>

      <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md border border-white/5 rounded-lg px-2 py-1 pointer-events-none flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#06b6d4]" />
        <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">
          Density: {(axisConfig.compactness * 100).toFixed(0)}%
        </span>
      </div>

      {hoveredDescriptor && popupPos && (
        <MiniGraphPopup descriptor={hoveredDescriptor} currSnap={currSnap} position={popupPos} />
      )}
    </div>
  )
}
