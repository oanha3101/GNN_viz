import { useMemo, useRef, useState, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { useLanguage } from '../../contexts/LanguageContext'
import { easeInOutCubic, interpolateSnapshots, lerpColor } from '../../engine/interpolate'
import {
  buildTask2FocusBuckets,
  buildTask2GraphDescriptors,
  buildTask2ModelSignature,
  describeTask2ReadoutPattern,
  formatTask2ClassLabel,
  getTask2DescriptorById,
  sortTask2Descriptors,
} from '../../utils/task2Metrics'
import { localizeTask2Element } from '../../utils/task2ReportI18n'

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

function buildStablePreviewGraph(graph) {
  if (!graph) return null
  const total = Math.max(graph.nodes.length, 1)
  const radius = Math.max(38, Math.min(88, total * 6))
  return {
    ...graph,
    nodes: graph.nodes.map((node, index) => {
      const angle = (index / total) * Math.PI * 2 - Math.PI / 2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      return { ...node, x, y, fx: x, fy: y }
    }),
    links: graph.links.map((link) => ({ ...link })),
  }
}

export default function ReadoutMonitor({ forcedFocus = null, forcedSelectedCell = null, reportMode = false, analysisMode = false }) {
  const { lang } = useLanguage()
  const reportLang = lang
  const hoveredGraphId = useGNNStore((state) => state.hoveredGraphId)
  const setHoveredGraph = useGNNStore((state) => state.setHoveredGraph)
  const selectedNodeId = useGNNStore((state) => state.selectedNodeId)
  const taskData = useGNNStore((state) => state.taskData)
  const classNames = useGNNStore((state) => state.classNames)
  const selectedModel = useGNNStore((state) => state.selectedModel)
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
  const modelSignature = useMemo(
    () => buildTask2ModelSignature(currSnap, snapshots, descriptors, selectedModel),
    [currSnap, snapshots, descriptors, selectedModel]
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
  const resolvedSelectedCell = forcedSelectedCell ?? selectedCell
  const resolvedBucket = focusBuckets.find((bucket) => bucket.id === resolvedFocus) || activeFocus

  const focusDescriptors = useMemo(() => {
    if (resolvedBucket.id === 'all') return descriptors
    const idSet = new Set(resolvedBucket.graphIds)
    return descriptors.filter((descriptorItem) => idSet.has(descriptorItem.originalGraphId))
  }, [resolvedBucket, descriptors])

  const scopedDescriptors = useMemo(() => {
    if (!resolvedSelectedCell) return focusDescriptors
    return focusDescriptors.filter((descriptorItem) => (
      descriptorItem.predicted === resolvedSelectedCell.pred && descriptorItem.groundTruth === resolvedSelectedCell.gt
    ))
  }, [focusDescriptors, resolvedSelectedCell])

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
  const previewGraph = useMemo(() => buildStablePreviewGraph(graph), [graph])

  const fgRef = useRef(null)
  const containerRef = useRef(null)
  const panelRootRef = useRef(null)
  const [dim, setDim] = useState({ w: 200, h: 150 })

  useEffect(() => {
    if (!fgRef.current || !previewGraph) return undefined
    fgRef.current.d3Force('charge')?.strength(0)
    fgRef.current.d3Force('link')?.distance(32)
    fgRef.current.d3Force('center')?.strength(0)

    const timer = setTimeout(() => {
      if (fgRef.current) fgRef.current.zoomToFit(300, 15)
    }, 60)
    return () => clearTimeout(timer)
  }, [previewGraph])

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

  useEffect(() => {
    if (reportLang !== 'vi' || !panelRootRef.current) return undefined
    const rafId = window.requestAnimationFrame(() => {
      localizeTask2Element(panelRootRef.current, reportLang)
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [reportMode, reportLang, activeGraphId, graph?.originalGraphId, epochInt])

  const heatmapColors = useMemo(() => {
    if (!graph || !currSnap?.node_contributions) return {}
    const contribs = currSnap.node_contributions[graph.sourceIndex] || []
    const colorMap = {}
    graph.nodes.forEach((node, index) => {
      const score = Math.max(0, Math.min(1, contribs[index] || 0))
      if (modelSignature.id === 'SAGE') {
        colorMap[node.id] = score < 0.45 ? lerpColor('#334155', '#22c55e', score / 0.45) : lerpColor('#22c55e', '#bbf7d0', (score - 0.45) / 0.55)
      } else if (modelSignature.id === 'GCN') {
        colorMap[node.id] = score < 0.5 ? lerpColor('#1e293b', '#38bdf8', score / 0.5) : lerpColor('#38bdf8', '#e0f2fe', (score - 0.5) / 0.5)
      } else if (score < 0.3) colorMap[node.id] = lerpColor('#334155', '#ea580c', score / 0.3)
      else if (score < 0.7) colorMap[node.id] = lerpColor('#ea580c', '#facc15', (score - 0.3) / 0.4)
      else colorMap[node.id] = lerpColor('#facc15', '#ffffff', (score - 0.7) / 0.3)
    })
    return colorMap
  }, [graph, currSnap, modelSignature])

  if (snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4 bg-nebula">
        <p className="text-center leading-relaxed">
          Hover a Task 2 embedding point
          <br />
          to inspect graph-level readout
        </p>
      </div>
    )
  }

  if (!graph) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4 bg-nebula">
        <p className="text-center leading-relaxed">
          No graph matches the active readout slice.
          <br />
          Try a broader focus or clear the confusion cell.
        </p>
      </div>
    )
  }

  const gtLabel = formatTask2ClassLabel(graphClassNames, graph.groundTruth, 'Unknown')
  const predLabel = formatTask2ClassLabel(graphClassNames, graph.predicted, 'Analyzing')
  const confidence = graph.confidence ?? 0
  const readoutPattern = graph.readoutPattern || describeTask2ReadoutPattern({
    entropyBucket: graph.entropyBucket,
    readoutBucket: graph.readoutBucket,
  })

  return (
    <div
      ref={panelRootRef}
      className={`h-full w-full overflow-y-auto custom-scrollbar bg-nebula text-xs text-slate-200 ${analysisMode ? 'p-4' : 'p-3'}`}
    >
      <div className="sticky top-0 z-20 -mx-1 mb-3 rounded-xl border border-line-subtle bg-deep/90 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Task 2 readout monitor</h3>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white">Graph #{graph.originalGraphId}</span>
              <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-200">
                {modelSignature.shortLabel}
              </span>
            </div>
          </div>
          {isPinned || reportMode ? (
            <button
              onClick={() => setSelectedGraph(null)}
              disabled={reportMode}
              className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30 transition-all"
              title="Release pinned graph"
            >
              {reportMode ? 'Report' : 'Pinned'}
            </button>
          ) : (
            <button
              onClick={() => setHoveredGraph(null)}
              className="rounded-full border border-line-default px-2 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-300 transition-colors"
            >
              Hover
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[9px]">
          <span className="bg-deep border border-line-default px-2 py-0.5 rounded text-slate-400">GT: <b className="text-slate-200">{gtLabel}</b></span>
          <span className="bg-deep border border-line-default px-2 py-0.5 rounded text-slate-400">Pred: <b className={graph.correct === 1 ? 'text-green-400' : 'text-red-400'}>{predLabel}</b></span>
          <span className="bg-deep border border-line-default px-2 py-0.5 rounded text-slate-400">
            {graph.nodes.length}n / {graph.links.length}e
          </span>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-md border border-line-subtle bg-nebula p-2">
        <MetaStat label="Density" value={graph.structural?.density} title="Existing undirected edges divided by all possible edges." />
        <MetaStat label="Cluster Coef" value={graph.structural?.avg_clustering} title="Average local triangle closure. A chain or tree can be 0 even when density is not 0." />
        <MetaStat label="AvgDeg" value={graph.structural?.avg_degree} digits={1} />
      </div>

      <div className="mb-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-nano text-slate-500 uppercase font-semibold tracking-ultra">Confidence</span>
          <span className={`text-micro font-mono font-bold tabular-nums ${confidence > 0.8 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {(confidence * 100).toFixed(1)}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-nebula rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${graph.correct === 1 ? 'bg-emerald-500' : 'bg-red-500'}`}
            style={{ width: `${Math.max(0, Math.min(1, confidence)) * 100}%` }}
          />
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative mb-3 overflow-hidden rounded-2xl border border-cyan-500/10 bg-deep/70 shadow-inner ${analysisMode ? 'h-[260px]' : 'h-[190px]'}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.10),transparent_58%)]" />
        <ForceGraph2D
          ref={fgRef}
          width={dim.w}
          height={dim.h}
          graphData={previewGraph}
          nodeCanvasObjectMode={() => 'replace'}
          nodeCanvasObject={(node, ctx, globalScale) => {
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
            const contribs = currSnap?.node_contributions?.[graph.sourceIndex] || []
            const score = Math.max(0, Math.min(1, contribs[node.id] || 0))
            const size = modelSignature.id === 'GCN' ? 6 + score * 3 : 6
            if (modelSignature.id === 'SAGE' && score > 0.35) {
              ctx.beginPath()
              ctx.arc(node.x, node.y, size + 8, 0, 2 * Math.PI, false)
              ctx.strokeStyle = 'rgba(34,197,94,0.24)'
              ctx.lineWidth = 1
              ctx.setLineDash([3, 3])
              ctx.stroke()
              ctx.setLineDash([])
            }
            if (modelSignature.id === 'GAT' && score > 0.6) {
              ctx.beginPath()
              ctx.arc(node.x, node.y, size + 7, 0, 2 * Math.PI, false)
              ctx.strokeStyle = 'rgba(245,158,11,0.5)'
              ctx.lineWidth = 2
              ctx.stroke()
            }
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
          linkColor={(link) => {
            if (modelSignature.id === 'GCN') return 'rgba(56,189,248,0.16)'
            if (modelSignature.id === 'SAGE') return 'rgba(34,197,94,0.16)'
            const source = typeof link.source === 'object' ? link.source.id : link.source
            const target = typeof link.target === 'object' ? link.target.id : link.target
            const contribs = currSnap?.node_contributions?.[graph.sourceIndex] || []
            const weight = ((contribs[source] || 0) + (contribs[target] || 0)) / 2
            return weight > 0.5 ? 'rgba(245,158,11,0.44)' : 'rgba(148,163,184,0.1)'
          }}
          linkWidth={(link) => {
            const source = typeof link.source === 'object' ? link.source.id : link.source
            const target = typeof link.target === 'object' ? link.target.id : link.target
            const contribs = currSnap?.node_contributions?.[graph.sourceIndex] || []
            const weight = ((contribs[source] || 0) + (contribs[target] || 0)) / 2
            return modelSignature.id === 'GAT' ? 1 + weight * 2 : 1
          }}
          backgroundColor="transparent"
          warmupTicks={0}
          cooldownTicks={0}
          d3VelocityDecay={0.9}
          enableZoomInteraction={false}
          enablePanInteraction={false}
          enableNodeDrag={false}
          onEngineStop={() => {
            if (fgRef.current) fgRef.current.zoomToFit(200, 20)
          }}
        />
      </div>

      <div className="grid gap-2 rounded-xl border border-line-subtle bg-deep/45 p-3 text-[11px] text-slate-300">
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

      <div className="mt-3 rounded-xl border border-cyan-500/10 bg-deep/55 p-3 space-y-2">
        <div className="text-nano text-slate-500 uppercase font-semibold tracking-ultra">Narrative profile · {modelSignature.primaryLabel}</div>
        <p className="text-[11px] leading-relaxed text-slate-300">
          {graph.motifSignature}. Top-k contribution is <span className="text-slate-100 font-semibold">{graph.readoutBucket}</span>, global entropy is <span className="text-slate-100 font-semibold">{graph.entropyBucket}</span>, so the readout pattern is <span className="text-slate-100 font-semibold">{readoutPattern}</span>. {modelSignature.explanation}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Tag label={graph.densityBucket} />
          <Tag label={graph.entropyBucket} />
          <Tag label={readoutPattern} />
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
                  <div className="w-5 h-5 rounded-sm flex items-center justify-center bg-nebula text-nano font-bold text-slate-100 shrink-0">
                    {node.nodeId}
                  </div>
                  <div className="h-1 flex-1 bg-nebula/50 rounded-full overflow-hidden">
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

function MetaStat({ label, value, digits = 3, title = undefined }) {
  const display = value != null && Number.isFinite(value) ? value.toFixed(digits) : '—'
  return (
    <div className="flex flex-col gap-0.5" title={title}>
      <span className="text-[8px] text-slate-500 uppercase tracking-ultra font-semibold">{label}</span>
      <span className="text-micro font-mono font-bold text-slate-200 tabular-nums">{display}</span>
    </div>
  )
}

function Tag({ label }) {
  return (
    <span className="rounded-full border border-line-default bg-nebula px-2 py-0.5 text-[10px] font-semibold text-slate-200">
      {label}
    </span>
  )
}
