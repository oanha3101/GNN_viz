import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import NodeHoverCard from './NodeHoverCard'
import { interpolateSnapshots } from '../../engine/interpolate'
import {
  buildTask2FocusBuckets,
  buildTask2GraphDescriptors,
  sortTask2Descriptors,
} from '../../utils/task2Metrics'

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
  const inferred = [...seen].sort((a, b) => a - b)
  return inferred.length ? inferred.map((classId) => `Class ${classId}`) : ['Class 0']
}

function formatFailureTag(tag) {
  switch (tag) {
    case 'overconfident_miss':
      return 'overconfident miss'
    case 'boundary_case':
      return 'boundary case'
    case 'diffuse_readout':
      return 'diffuse readout'
    case 'structural_outlier':
      return 'structural outlier'
    case 'stable_win':
    default:
      return 'stable win'
  }
}

function MiniGraphSVG({ nodes, links, contributions, size = 100 }) {
  const padding = 15
  const radius = (size - padding * 2) / 2
  const centerX = size / 2
  const centerY = size / 2

  const nodePos = useMemo(() => {
    const positions = {}
    const total = nodes.length
    nodes.forEach((node, index) => {
      const angle = (index / total) * Math.PI * 2 - Math.PI / 2
      positions[node.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      }
    })
    return positions
  }, [nodes, radius, centerX, centerY])

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="drop-shadow-sm">
      {links.map((link, index) => {
        const source = typeof link.source === 'object' ? link.source.id : link.source
        const target = typeof link.target === 'object' ? link.target.id : link.target
        const from = nodePos[source]
        const to = nodePos[target]
        if (!from || !to) return null
        return (
          <line
            key={index}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="rgba(148,163,184,0.16)"
            strokeWidth="0.8"
          />
        )
      })}
      {nodes.map((node) => {
        const point = nodePos[node.id]
        if (!point) return null
        const weight = contributions?.[node.id] || 0
        const fill = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#38bdf8'
        const nodeSize = 2.4 + weight * 4.8
        return (
          <g key={node.id}>
            {weight > 0.7 && (
              <circle cx={point.x} cy={point.y} r={nodeSize + 3} fill={fill} opacity="0.16" />
            )}
            <circle cx={point.x} cy={point.y} r={nodeSize} fill={fill} />
          </g>
        )
      })}
    </svg>
  )
}

function useResponsiveGridCols(ref) {
  const [cols, setCols] = useState(3)

  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        let next = 1
        if (width >= 1400) next = 5
        else if (width >= 1100) next = 4
        else if (width >= 820) next = 3
        else if (width >= 520) next = 2
        setCols(next)
      }
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])

  return cols
}

function matchesCell(descriptor, selectedCell) {
  if (!selectedCell) return true
  return descriptor.predicted === selectedCell.pred && descriptor.groundTruth === selectedCell.gt
}

export default function TaskTopology2({
  forcedGallerySort = null,
  forcedFocus = null,
  hideGalleryControls = false,
  showFullCollection = false,
  showGalleryOnly = false,
}) {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const taskData = useGNNStore((state) => state.taskData)
  const classNames = useGNNStore((state) => state.classNames)
  const setSelectedNode = useGNNStore((state) => state.setSelectedNode)
  const setHoveredNode = useGNNStore((state) => state.setHoveredNode)
  const selectedNodeId = useGNNStore((state) => state.selectedNodeId)
  const focusMode = useGNNStore((state) => state.task2FocusMode)
  const setFocusMode = useGNNStore((state) => state.setTask2FocusMode)
  const gallerySort = useGNNStore((state) => state.task2GallerySort)
  const setGallerySort = useGNNStore((state) => state.setTask2GallerySort)
  const classFilter = useGNNStore((state) => state.task2ClassFilter)
  const setClassFilter = useGNNStore((state) => state.setTask2ClassFilter)
  const selectedCell = useGNNStore((state) => state.task2SelectedCell)

  const fgRefDetail = useRef(null)
  const gridRef = useRef(null)
  const cols = useResponsiveGridCols(gridRef)
  const [page, setPage] = useState(1)

  const graphs = taskData?.graphs || []
  const indexedGraphs = useMemo(
    () => graphs.map((graph, index) => ({
      ...graph,
      originalGraphId: graph?.originalGraphId ?? index,
      sourceIndex: graph?.sourceIndex ?? index,
    })),
    [graphs]
  )

  const graphClassNames = useMemo(
    () => buildGraphClassNames(indexedGraphs, taskData?.classNames || classNames),
    [indexedGraphs, taskData?.classNames, classNames]
  )
  const labelForClass = useCallback(
    (classId) => graphClassNames[classId] || `Class ${classId}`,
    [graphClassNames]
  )

  const epochInt = Math.floor(currentEpochFloat)
  const frac = currentEpochFloat - epochInt
  const snapA = snapshots[epochInt] || snapshots[snapshots.length - 1]
  const snapB = snapshots[Math.min(epochInt + 1, snapshots.length - 1)]
  const snap = frac > 0 && snapB ? interpolateSnapshots(snapA, snapB, frac) : snapA

  const descriptors = useMemo(
    () => buildTask2GraphDescriptors({ snapshot: snap, graphs: indexedGraphs, classNames: graphClassNames }),
    [snap, indexedGraphs, graphClassNames]
  )
  const focusBuckets = useMemo(
    () => buildTask2FocusBuckets({ snapshot: snap, graphs: indexedGraphs }),
    [snap, indexedGraphs]
  )
  const activeFocus = focusBuckets.find((bucket) => bucket.id === focusMode) || focusBuckets[0] || {
    id: 'all',
    label: 'All',
    description: 'Entire graph collection.',
    graphIds: descriptors.map((descriptor) => descriptor.originalGraphId),
  }

  const focusDescriptors = useMemo(() => {
    if (activeFocus.id === 'all') return descriptors
    const idSet = new Set(activeFocus.graphIds)
    return descriptors.filter((descriptor) => idSet.has(descriptor.originalGraphId))
  }, [activeFocus, descriptors])

  const filteredDescriptors = useMemo(() => {
    if (classFilter === 'all') return focusDescriptors
    return focusDescriptors.filter((descriptor) => descriptor.groundTruth === Number(classFilter))
  }, [classFilter, focusDescriptors])

  const activeGallerySort = forcedGallerySort || gallerySort

  const sortedDescriptors = useMemo(
    () => sortTask2Descriptors(filteredDescriptors, activeGallerySort),
    [filteredDescriptors, activeGallerySort]
  )

  const selectedCellMatches = useMemo(
    () => sortedDescriptors.filter((descriptor) => matchesCell(descriptor, selectedCell)),
    [sortedDescriptors, selectedCell]
  )

  const pageSize = Math.max(8, cols * 6)
  const totalPages = showFullCollection ? 1 : Math.max(1, Math.ceil(sortedDescriptors.length / pageSize))
  const currentPage = showFullCollection ? 1 : Math.min(page, totalPages)
  const pageStart = showFullCollection ? 0 : (currentPage - 1) * pageSize
  const pagedDescriptors = useMemo(
    () => (showFullCollection ? sortedDescriptors : sortedDescriptors.slice(pageStart, pageStart + pageSize)),
    [showFullCollection, sortedDescriptors, pageStart, pageSize]
  )

  useEffect(() => {
    if (forcedFocus && forcedFocus !== focusMode) {
      setFocusMode(forcedFocus)
    }
  }, [forcedFocus, focusMode, setFocusMode])

  useEffect(() => {
    if (showFullCollection) return undefined
    setPage((current) => Math.min(Math.max(current, 1), totalPages))
    return undefined
  }, [showFullCollection, totalPages])

  useEffect(() => {
    if (showFullCollection) return undefined
    setPage(1)
    return undefined
  }, [showFullCollection, focusMode, gallerySort, classFilter, selectedCell, graphs.length])

  const selectedGraph = useMemo(
    () => {
      if (showGalleryOnly) return null
      return descriptors.find((descriptor) => descriptor.originalGraphId === selectedNodeId) || null
    },
    [showGalleryOnly, descriptors, selectedNodeId]
  )

  const detailGraphData = useMemo(() => {
    if (!selectedGraph) return null
    return {
      nodes: selectedGraph.nodes.map((node) => ({ ...node })),
      links: selectedGraph.links.map((link) => ({ ...link })),
    }
  }, [selectedGraph])

  const contributions = snap?.node_contributions || []

  const renderNodeDetail = useCallback(
    (node, ctx, globalScale) => {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return
      const graphContribs = contributions[selectedGraph?.sourceIndex ?? -1] || []
      const weight = graphContribs[node.id] || 0
      const color = weight > 0.8 ? '#ffffff' : weight > 0.5 ? '#f59e0b' : '#3b82f6'
      const size = (4 + weight * 12) / Math.sqrt(globalScale)

      ctx.save()
      const glowRadius = size * 3
      const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius)
      gradient.addColorStop(0, weight > 0.5 ? `${color}44` : `${color}22`)
      gradient.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI)
      ctx.fillStyle = gradient
      ctx.fill()
      ctx.restore()

      ctx.beginPath()
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()

      const fontSize = Math.max(7, 10 / Math.sqrt(globalScale))
      ctx.font = `bold ${fontSize}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = weight > 0.6 ? '#0f172a' : '#fff'
      ctx.fillText(`${node.id}`, node.x, node.y)
    },
    [selectedGraph, contributions]
  )

  useEffect(() => {
    if (!selectedGraph || !fgRefDetail.current) return
    const graphRef = fgRefDetail.current
    graphRef.d3Force('charge').strength(-100).distanceMax(250)
    graphRef.d3Force('link').distance(40)
    graphRef.d3Force('center').strength(0.1)
    graphRef.d3ReheatSimulation()
  }, [selectedGraph])

  if (!descriptors.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs bg-panel">
        No graph data
      </div>
    )
  }

  if (selectedGraph && detailGraphData) {
    const predictionLabel = selectedGraph.predicted != null
      ? labelForClass(selectedGraph.predicted)
      : 'Pending'

    return (
      <div className="w-full h-full relative bg-panel overflow-hidden">
        <div className="absolute inset-0" style={{ zIndex: 1 }}>
          <ForceGraph2D
            ref={fgRefDetail}
            graphData={detailGraphData}
            nodeCanvasObject={renderNodeDetail}
            nodeCanvasObjectMode={() => 'replace'}
            onNodeHover={(node) => setHoveredNode(node?.id ?? null)}
            linkColor={() => 'rgba(59, 130, 246, 0.15)'}
            linkWidth={1.5}
            backgroundColor="transparent"
            onEngineStop={() => {
              if (fgRefDetail.current) fgRefDetail.current.zoomToFit(400, 30)
            }}
          />
        </div>

        <NodeHoverCard />

        <div className="absolute top-3 left-3 z-50">
          <button
            type="button"
            onClick={() => setSelectedNode(null)}
            className="px-3 py-1.5 rounded-md text-micro font-bold tracking-wide bg-slate-900/90 text-slate-200 hover:bg-slate-800 transition-colors border border-slate-700/60 uppercase shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            Back to gallery
          </button>
        </div>

        <div className="absolute top-3 right-3 z-50 flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900/80 border border-slate-700/50 text-micro font-mono text-slate-300 shadow-lg">
          <span className="text-nano uppercase tracking-ultra text-slate-500">#{selectedGraph.originalGraphId}</span>
          <span className="text-slate-200">{labelForClass(selectedGraph.groundTruth)}</span>
          <span className={selectedGraph.correct === 1 ? 'text-emerald-300' : 'text-red-300'}>
            {predictionLabel}
          </span>
          <span className="text-slate-400">{((selectedGraph.confidence ?? 0) * 100).toFixed(0)}%</span>
        </div>
      </div>
    )
  }

  const classFilterOptions = Array.from(
    new Set(descriptors.map((descriptor) => descriptor.groundTruth).filter(Number.isInteger))
  ).sort((a, b) => a - b)

  return (
    <div ref={gridRef} className="w-full h-full overflow-y-auto bg-panel custom-scrollbar">
      <div className="pt-16 pb-6 px-6">
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-800/60 bg-slate-950/35 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-nano uppercase tracking-ultra text-slate-500">Graph collection</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-micro text-slate-300">
                <span className="font-bold">{sortedDescriptors.length} graphs</span>
                <span className="text-slate-600">·</span>
                <span>{graphClassNames.length || 1} class profiles</span>
                <span className="text-slate-600">·</span>
                <span>{activeFocus.label}</span>
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {selectedCell
                  ? `${selectedCellMatches.length} graphs match the active confusion cell. The rest stay visible so you can keep structural context.`
                  : activeFocus.description}
              </div>
            </div>
            {showFullCollection ? (
              <div className="rounded-md border border-cyan-500/20 bg-cyan-500/8 px-3 py-1.5 text-micro font-semibold text-cyan-200">
                Showing the full collection in one view
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md border border-slate-800 px-3 py-1.5 text-micro font-bold uppercase tracking-wide text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="min-w-[72px] text-center text-micro font-mono text-slate-400">
                  Page {currentPage}/{totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-md border border-slate-800 px-3 py-1.5 text-micro font-bold uppercase tracking-wide text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {!hideGalleryControls && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  ['priority', 'Priority'],
                  ['confidence_desc', 'Confidence'],
                  ['entropy_desc', 'Entropy'],
                  ['size_desc', 'Size'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGallerySort(value)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                      activeGallerySort === value
                        ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                        : 'border-slate-800/70 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="uppercase tracking-ultra text-slate-500">GT class</span>
                <select
                  value={classFilter}
                  onChange={(event) => setClassFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}
                  className="rounded-md border border-slate-800/70 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <option value="all">All</option>
                  {classFilterOptions.map((classId) => (
                    <option key={classId} value={classId}>
                      {labelForClass(classId)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {pagedDescriptors.map((descriptor) => {
            const matched = matchesCell(descriptor, selectedCell)
            const confidence = descriptor.confidence || 0
            const selected = descriptor.originalGraphId === selectedNodeId
            const predictionLabel = descriptor.predicted != null
              ? labelForClass(descriptor.predicted)
              : 'Pending'
            const quickTone = descriptor.correct === 1
              ? 'border-emerald-500/30 hover:border-emerald-500/60'
              : 'border-red-500/30 hover:border-red-500/60'

            return (
              <button
                type="button"
                key={descriptor.originalGraphId}
                onClick={() => setSelectedNode(descriptor.originalGraphId)}
                className={`group relative rounded-lg border text-left transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                  selected
                    ? 'ring-2 ring-cyan-500/35 bg-slate-900/70'
                    : `bg-slate-900/40 ${quickTone}`
                } ${matched ? 'opacity-100' : 'opacity-45'}`}
              >
                <div className="h-28 p-3 relative">
                  <MiniGraphSVG
                    nodes={descriptor.nodes}
                    links={descriptor.links}
                    contributions={contributions[descriptor.sourceIndex]}
                  />
                </div>

                <div className="px-3 py-2 border-t border-slate-800/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-100 font-semibold uppercase truncate tracking-wide">
                        G#{descriptor.originalGraphId}
                      </p>
                      <p className="text-nano text-slate-500 font-mono">
                        {descriptor.nodes.length}n/{descriptor.links.length}e
                      </p>
                    </div>
                    <span
                      className={`text-nano font-mono font-bold px-1.5 py-0.5 rounded-sm tabular-nums ${
                        confidence > 0.8
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : confidence > 0.55
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-red-500/15 text-red-300'
                      }`}
                    >
                      {(confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="mt-3 grid gap-1 text-[11px] text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">GT</span>
                      <span>{labelForClass(descriptor.groundTruth)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Pred</span>
                      <span className={descriptor.correct === 1 ? 'text-emerald-300' : 'text-red-300'}>
                        {predictionLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Status</span>
                      <span>{descriptor.correct === 1 ? 'Correct' : 'Wrong'}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-slate-800/70 bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-300">
                      margin {((descriptor.margin ?? 0) * 100).toFixed(0)}%
                    </span>
                    <span className="rounded-full border border-slate-800/70 bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-300">
                      {descriptor.densityBucket}
                    </span>
                    <span className="rounded-full border border-slate-800/70 bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-300">
                      {descriptor.entropyBucket}
                    </span>
                  </div>

                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    {descriptor.motifSignature} · {formatFailureTag(descriptor.failureTag)}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
