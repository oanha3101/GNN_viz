import { useMemo, useRef, useState, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic, interpolateSnapshots, lerpColor } from '../../engine/interpolate'
import { buildTask2FocusBuckets, buildTask2GraphDescriptors, getTask2DescriptorById, sortTask2Descriptors } from '../../utils/task2Metrics'

function buildGraphClassNames(graphs = [], taskClassNames = []) {
  if (Array.isArray(taskClassNames) && taskClassNames.length) {
    return taskClassNames
  }
  const seen = new Set()
  for (const graph of graphs) {
    if (Number.isInteger(graph?.groundTruth)) {
      seen.add(graph.groundTruth)
    }
  }
  return [...seen].sort((a, b) => a - b).map((classId) => `Class ${classId}`)
}

function formatFailureTag(tag) {
  switch (tag) {
    case 'overconfident_miss':
      return 'Overconfident miss'
    case 'boundary_case':
      return 'Boundary case'
    case 'diffuse_readout':
      return 'Diffuse readout'
    case 'structural_outlier':
      return 'Structural outlier'
    case 'stable_win':
    default:
      return 'Stable win'
  }
}

export default function ReadoutMonitor({ forcedFocus = null }) {
  const hoveredGraphId = useGNNStore((state) => state.hoveredGraphId)
  const setHoveredGraph = useGNNStore((state) => state.setHoveredGraph)
  const selectedNodeId = useGNNStore((state) => state.selectedNodeId)
  const taskData = useGNNStore((state) => state.taskData)
  const classNames = useGNNStore((state) => state.classNames)
  const setSelectedGraph = useGNNStore((state) => state.setSelectedNode)
  const focusMode = useGNNStore((state) => state.task2FocusMode)
  const selectedCell = useGNNStore((state) => state.task2SelectedCell)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const isPinned = selectedNodeId !== null
  const activeGraphId = isPinned ? selectedNodeId : hoveredGraphId

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const t = easeInOutCubic(Math.max(0, Math.min(1, currentEpochFloat - epochInt)))
  const snapA = snapshots[epochInt]
  const snapB = snapshots[epochInt + 1] || snapA

  const currSnap = useMemo(() => {
    if (!snapA) return null
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

  const graphClassNames = useMemo(
    () => buildGraphClassNames(indexedGraphs, taskData?.classNames || classNames),
    [indexedGraphs, taskData?.classNames, classNames]
  )

  const descriptors = useMemo(
    () => buildTask2GraphDescriptors({ snapshot: currSnap, graphs: indexedGraphs, classNames: graphClassNames }),
    [currSnap, indexedGraphs, graphClassNames]
  )

  const focusBuckets = useMemo(
    () => buildTask2FocusBuckets({ snapshot: currSnap, graphs: indexedGraphs, classNames: graphClassNames }),
    [currSnap, indexedGraphs, graphClassNames]
  )

  const activeFocus = focusBuckets.find((bucket) => bucket.id === focusMode) || focusBuckets[0] || {
    id: 'all',
    graphIds: descriptors.map((item) => item.originalGraphId),
  }
  const resolvedFocus = forcedFocus || activeFocus.id
  const resolvedBucket = focusBuckets.find((bucket) => bucket.id === resolvedFocus) || activeFocus

  const focusDescriptors = useMemo(() => {
    if (resolvedBucket.id === 'all') return descriptors
    const idSet = new Set(resolvedBucket.graphIds)
    return descriptors.filter((descriptorItem) => idSet.has(descriptorItem.originalGraphId))
  }, [resolvedBucket, descriptors])

  const scopedDescriptors = useMemo(() => {
    if (!selectedCell) return focusDescriptors
    return focusDescriptors.filter((descriptorItem) => (
      descriptorItem.predicted === selectedCell.pred && descriptorItem.groundTruth === selectedCell.gt
    ))
  }, [focusDescriptors, selectedCell])

  const descriptor = useMemo(
    () => (
      getTask2DescriptorById(scopedDescriptors, activeGraphId)
      || getTask2DescriptorById(focusDescriptors, activeGraphId)
      || sortTask2Descriptors(scopedDescriptors, 'priority')[0]
      || sortTask2Descriptors(focusDescriptors, 'priority')[0]
      || null
    ),
    [scopedDescriptors, focusDescriptors, activeGraphId]
  )

  const graph = useMemo(() => {
    if (!descriptor) return null
    return {
      ...descriptor,
      nodes: descriptor.nodes.map((node) => ({ ...node })),
      links: descriptor.links.map((link) => ({ ...link })),
    }
  }, [descriptor])

  const fgRef = useRef(null)
  const containerRef = useRef(null)
  const [dim, setDim] = useState({ w: 200, h: 150 })

  useEffect(() => {
    if (!fgRef.current || !graph) return undefined
    fgRef.current.d3Force('charge').strength(-60).distanceMax(100)
    fgRef.current.d3Force('link').distance(20)
    fgRef.current.d3Force('center').strength(0.5)
    fgRef.current.d3ReheatSimulation()

    const timer = setTimeout(() => {
      if (fgRef.current) fgRef.current.zoomToFit(300, 15)
    }, 100)
    return () => clearTimeout(timer)
  }, [graph])

  useEffect(() => {
    if (!containerRef.current) return undefined
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDim({ w: entry.contentRect.width || 100, h: entry.contentRect.height || 100 })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const heatmapColors = useMemo(() => {
    if (!graph || !currSnap?.node_contributions) return {}
    const contribs = currSnap.node_contributions[graph.sourceIndex] || []
    const colorMap = {}
    graph.nodes.forEach((node, index) => {
      const score = Math.max(0, Math.min(1, contribs[index] || 0))
      if (score < 0.3) colorMap[node.id] = lerpColor('#334155', '#ea580c', score / 0.3)
      else if (score < 0.7) colorMap[node.id] = lerpColor('#ea580c', '#facc15', (score - 0.3) / 0.4)
      else colorMap[node.id] = lerpColor('#facc15', '#ffffff', (score - 0.7) / 0.3)
    })
    return colorMap
  }, [graph, currSnap])

  if (activeGraphId === null || snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4 bg-slate-950">
        <p className="text-center leading-relaxed">
          Hover a Task 2 embedding point
          <br />
          to inspect graph-level readout
        </p>
      </div>
    )
  }

  if (!graph) return null

  const gtLabel = graphClassNames[graph.groundTruth] || `Class ${graph.groundTruth}`
  const predLabel = graph.predicted != null
    ? (graphClassNames[graph.predicted] || `Class ${graph.predicted}`)
    : 'Analyzing'
  const confidence = graph.confidence ?? 0

  return (
    <div className="h-full flex flex-col p-3 text-xs w-full relative bg-slate-950">
      <div className="mb-3 space-y-1.5 z-10">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">Task 2 readout monitor</h3>
          {isPinned ? (
            <button
              onClick={() => setSelectedGraph(null)}
              className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30 transition-all"
              title="Release pinned graph"
            >
              Pinned
            </button>
          ) : (
            <button
              onClick={() => setHoveredGraph(null)}
              className="rounded-full border border-slate-700/70 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-300 transition-colors"
            >
              Hover
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">Graph #{graph.originalGraphId}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px]">
          <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400">GT: <b className="text-slate-200">{gtLabel}</b></span>
          <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400">Pred: <b className={graph.correct === 1 ? 'text-green-400' : 'text-red-400'}>{predLabel}</b></span>
          <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400">
            {graph.nodes.length}n / {graph.links.length}e
          </span>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-md border border-slate-800/60 bg-slate-900/50 p-2">
        <MetaStat label="Density" value={graph.structural?.density} />
        <MetaStat label="Clustering" value={graph.structural?.avg_clustering} />
        <MetaStat label="AvgDeg" value={graph.structural?.avg_degree} digits={1} />
      </div>

      <div className="mb-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-nano text-slate-500 uppercase font-semibold tracking-ultra">Confidence</span>
          <span className={`text-micro font-mono font-bold tabular-nums ${confidence > 0.8 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {(confidence * 100).toFixed(1)}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-800/60 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${graph.correct === 1 ? 'bg-emerald-500' : 'bg-red-500'}`}
            style={{ width: `${Math.max(0, Math.min(1, confidence)) * 100}%` }}
          />
        </div>
      </div>

      <div ref={containerRef} className="flex-1 min-h-[140px] relative bg-slate-900/30 rounded-xl overflow-hidden border border-slate-800/50 shadow-inner">
        <ForceGraph2D
          ref={fgRef}
          width={dim.w}
          height={dim.h}
          graphData={graph}
          nodeCanvasObjectMode={() => 'replace'}
          nodeCanvasObject={(node, ctx, globalScale) => {
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
            const size = 6
            ctx.beginPath()
            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false)
            const color = heatmapColors[node.id] || '#475569'
            ctx.fillStyle = color
            ctx.fill()

            const scale = Math.max(0.001, globalScale || 1)
            const fontSize = Math.max(3, Math.min(24, 10 / Math.sqrt(scale)))
            ctx.font = `bold ${fontSize}px monospace`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillStyle = typeof color === 'string' && (color.includes('255, 255') || color === '#ffffff')
              ? '#0f172a'
              : '#ffffff'
            const label = node.original_id !== undefined ? node.original_id : node.id
            ctx.fillText(label, node.x, node.y)
          }}
          linkColor={() => 'rgba(148,163,184,0.1)'}
          linkWidth={1}
          backgroundColor="transparent"
          cooldownTicks={60}
          d3VelocityDecay={0.6}
          enableZoomInteraction={false}
          enablePanInteraction={false}
          onEngineStop={() => {
            if (fgRef.current) fgRef.current.zoomToFit(200, 20)
          }}
        />
      </div>

      <div className="mt-3 grid gap-2 text-[11px] text-slate-300">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Margin</span>
          <span className="font-mono text-slate-200">{((graph.margin ?? 0) * 100).toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Entropy</span>
          <span className="font-mono text-slate-200">{((graph.entropy ?? 0) * 100).toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Readout concentration</span>
          <span className="font-mono text-slate-200">{(graph.readoutConcentration * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-800/60 bg-slate-900/50 p-3 space-y-2">
        <div className="text-nano text-slate-500 uppercase font-semibold tracking-ultra">Narrative profile</div>
        <p className="text-[11px] leading-relaxed text-slate-300">
          {graph.motifSignature}. The readout is <span className="text-slate-100 font-semibold">{graph.readoutBucket}</span> and the graph currently reads as <span className="text-slate-100 font-semibold">{formatFailureTag(graph.failureTag)}</span>.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Tag label={graph.densityBucket} />
          <Tag label={graph.entropyBucket} />
          <Tag label={graph.readoutBucket} />
          <Tag label={formatFailureTag(graph.failureTag)} />
        </div>
      </div>

      {graph.topContributors?.length > 0 && (
        <div className="mt-3 space-y-1.5 z-10">
          <span className="text-nano text-slate-500 uppercase font-semibold tracking-ultra block">Top contributors</span>
          <div className="space-y-1">
            {graph.topContributors.map((node) => (
              <div key={node.nodeId} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-5 h-5 rounded-sm flex items-center justify-center bg-slate-800 text-nano font-bold text-slate-100 shrink-0">
                    {node.nodeId}
                  </div>
                  <div className="h-1 flex-1 bg-slate-800/50 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${Math.max(0, Math.min(1, node.value)) * 100}%` }} />
                  </div>
                </div>
                <span className="text-nano font-bold font-mono text-amber-400 tabular-nums shrink-0">
                  {(node.value * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetaStat({ label, value, digits = 3 }) {
  const display = value != null && Number.isFinite(value) ? value.toFixed(digits) : '—'
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[8px] text-slate-500 uppercase tracking-ultra font-semibold">{label}</span>
      <span className="text-micro font-mono font-bold text-slate-200 tabular-nums">{display}</span>
    </div>
  )
}

function Tag({ label }) {
  return (
    <span className="rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
      {label}
    </span>
  )
}
