import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { useLanguage } from '../../contexts/LanguageContext'
import { interpolateSnapshots } from '../../engine/interpolate'
import {
  buildTask2FocusBuckets,
  buildTask2GraphDescriptors,
  buildTask2ModelSignature,
  sortTask2Descriptors,
} from '../../utils/task2Metrics'
import { localizeTask2Element } from '../../utils/task2ReportI18n'

function buildDetailGraphStructureKey(graph) {
  if (!graph) return null
  const nodeKey = graph.nodes
    .map((node) => node.id)
    .sort((a, b) => a - b)
    .join(',')
  const linkKey = graph.links
    .map((link) => {
      const source = typeof link.source === 'object' ? link.source.id : link.source
      const target = typeof link.target === 'object' ? link.target.id : link.target
      return source < target ? `${source}-${target}` : `${target}-${source}`
    })
    .sort()
    .join('|')
  return `${graph.originalGraphId}:${nodeKey}:${linkKey}`
}

function createStableDetailGraphData(graph) {
  if (!graph) return null
  const total = Math.max(graph.nodes.length, 1)
  const radius = Math.max(70, Math.min(180, total * 12))
  const nodes = graph.nodes.map((node, index) => {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2
    return {
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  })
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const links = graph.links.map((link) => ({ ...link }))
  const area = Math.max(220 * 220, total * 4600)
  const k = Math.sqrt(area / total)

  for (let iter = 0; iter < 110; iter += 1) {
    const cooling = 1 - iter / 110
    const disp = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]))

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.max(8, Math.hypot(dx, dy))
        const force = (k * k) / dist
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        disp.get(a.id).x += fx
        disp.get(a.id).y += fy
        disp.get(b.id).x -= fx
        disp.get(b.id).y -= fy
      }
    }

    links.forEach((link) => {
      const source = typeof link.source === 'object' ? link.source.id : link.source
      const target = typeof link.target === 'object' ? link.target.id : link.target
      const a = nodeById.get(source)
      const b = nodeById.get(target)
      if (!a || !b) return
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.max(8, Math.hypot(dx, dy))
      const force = (dist * dist) / k
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      disp.get(a.id).x -= fx
      disp.get(a.id).y -= fy
      disp.get(b.id).x += fx
      disp.get(b.id).y += fy
    })

    nodes.forEach((node) => {
      const delta = disp.get(node.id)
      const length = Math.max(1, Math.hypot(delta.x, delta.y))
      const step = Math.min(length, 14 * cooling)
      node.x += (delta.x / length) * step
      node.y += (delta.y / length) * step
    })
  }

  const centerX = nodes.reduce((sum, node) => sum + node.x, 0) / total
  const centerY = nodes.reduce((sum, node) => sum + node.y, 0) / total
  const maxDistance = Math.max(
    1,
    ...nodes.map((node) => Math.hypot(node.x - centerX, node.y - centerY))
  )
  const targetRadius = Math.max(70, Math.min(210, total * 11))
  const scale = targetRadius / maxDistance
  nodes.forEach((node) => {
    node.x = (node.x - centerX) * scale
    node.y = (node.y - centerY) * scale
  })

  return {
    nodes,
    links,
  }
}

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

function MiniGraphSVG({ nodes, links, contributions, modelSignature = null, size = 100 }) {
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
        const sourceWeight = contributions?.[source] || 0
        const targetWeight = contributions?.[target] || 0
        const linkWeight = (sourceWeight + targetWeight) / 2
        const isGat = modelSignature?.id === 'GAT'
        const isSage = modelSignature?.id === 'SAGE'
        const stroke = isGat && linkWeight > 0.5
          ? 'rgba(245,158,11,0.55)'
          : isSage && linkWeight > 0.35
            ? 'rgba(34,197,94,0.38)'
            : modelSignature?.id === 'GCN'
              ? 'rgba(56,189,248,0.22)'
              : 'rgba(148,163,184,0.16)'
        return (
          <line
            key={index}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={stroke}
            strokeWidth={isGat ? 0.8 + linkWeight * 1.8 : isSage ? 0.8 + linkWeight : 0.9}
            strokeDasharray={isSage && linkWeight > 0.35 ? '2 2' : undefined}
          />
        )
      })}
      {nodes.map((node) => {
        const point = nodePos[node.id]
        if (!point) return null
        const weight = contributions?.[node.id] || 0
        const fill = modelSignature?.id === 'SAGE'
          ? (weight > 0.6 ? '#86efac' : '#34d399')
          : weight > 0.8
            ? '#ffffff'
            : weight > 0.5
              ? '#f59e0b'
              : '#38bdf8'
        const nodeSize = modelSignature?.id === 'GCN'
          ? 3.2 + weight * 3.8
          : 2.4 + weight * 4.8
        return (
          <g key={node.id}>
            {modelSignature?.id === 'GCN' && (
              <circle cx={point.x} cy={point.y} r={nodeSize + 5} fill="#38bdf8" opacity={0.08 + weight * 0.12} />
            )}
            {weight > 0.7 && (
              <circle cx={point.x} cy={point.y} r={nodeSize + (modelSignature?.id === 'GAT' ? 5 : 3)} fill={fill} opacity={modelSignature?.id === 'GAT' ? 0.26 : 0.16} />
            )}
            {modelSignature?.id === 'SAGE' && weight > 0.35 && (
              <circle cx={point.x} cy={point.y} r={nodeSize + 7} fill="none" stroke="#22c55e" strokeWidth="1" opacity="0.22" strokeDasharray="2 2" />
            )}
            <circle cx={point.x} cy={point.y} r={nodeSize} fill={fill} />
          </g>
        )
      })}
    </svg>
  )
}

function DetailGraphSVG({ graph, contributions = [], modelSignature = null, onNodeHover }) {
  const positions = useMemo(() => {
    const map = {}
    graph.nodes.forEach((node) => {
      map[node.id] = { x: node.x || 0, y: node.y || 0 }
    })
    return map
  }, [graph.nodes])
  const bounds = useMemo(() => {
    const xs = graph.nodes.map((node) => Number.isFinite(node.x) ? node.x : 0)
    const ys = graph.nodes.map((node) => Number.isFinite(node.y) ? node.y : 0)
    const minX = Math.min(...xs, -80)
    const maxX = Math.max(...xs, 80)
    const minY = Math.min(...ys, -80)
    const maxY = Math.max(...ys, 80)
    const pad = 58
    return {
      x: minX - pad,
      y: minY - pad,
      width: Math.max(180, maxX - minX + pad * 2),
      height: Math.max(180, maxY - minY + pad * 2),
    }
  }, [graph.nodes])

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="drop-shadow-[0_24px_60px_rgba(8,47,73,0.28)]"
      role="img"
      aria-label={`Graph ${graph.originalGraphId} structure`}
    >
      <defs>
        <filter id={`task2-node-glow-${graph.originalGraphId}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {graph.links.map((link, index) => {
        const source = typeof link.source === 'object' ? link.source.id : link.source
        const target = typeof link.target === 'object' ? link.target.id : link.target
        const from = positions[source]
        const to = positions[target]
        if (!from || !to) return null
        const weight = ((contributions[source] || 0) + (contributions[target] || 0)) / 2
        return (
          <line
            key={`${source}-${target}-${index}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={weight > 0.55 ? 'rgba(34,211,238,0.44)' : 'rgba(59,130,246,0.24)'}
            strokeWidth={2.2 + weight * 2.2}
            strokeLinecap="round"
          />
        )
      })}
      {graph.nodes.map((node) => {
        const point = positions[node.id]
        const weight = Math.max(0, Math.min(1, contributions[node.id] || 0))
        const isFocus = weight >= 0.55
        const fill = modelSignature?.id === 'SAGE'
          ? (isFocus ? '#34d399' : '#60a5fa')
          : isFocus
            ? '#fbbf24'
            : '#3b82f6'
        const size = 11 + weight * 11
        const label = node.original_id !== undefined ? node.original_id : node.id
        return (
          <g
            key={node.id}
            onMouseEnter={() => onNodeHover?.(node.id)}
            onMouseLeave={() => onNodeHover?.(null)}
            className="cursor-default"
          >
            <circle
              cx={point.x}
              cy={point.y}
              r={size + 12}
              fill={fill}
              opacity={isFocus ? 0.16 : 0.08}
              filter={`url(#task2-node-glow-${graph.originalGraphId})`}
            />
            <circle cx={point.x} cy={point.y} r={size} fill={fill} stroke="rgba(226,232,240,0.55)" strokeWidth="1.5" />
            <text
              x={point.x}
              y={point.y + 0.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isFocus ? '#0f172a' : '#ffffff'}
              fontSize={Math.max(9, size * 0.78)}
              fontWeight="800"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {label}
            </text>
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
  forcedSelectedCell = null,
  forcedClassFilter = null,
  hideGalleryControls = false,
  showFullCollection = false,
  showGalleryOnly = false,
  reportMode = false,
  analysisMode = false,
}) {
  const { lang } = useLanguage()
  const reportLang = lang
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const taskData = useGNNStore((state) => state.taskData)
  const classNames = useGNNStore((state) => state.classNames)
  const selectedModel = useGNNStore((state) => state.selectedModel)
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

  const panelRootRef = useRef(null)
  const gridRef = useRef(null)
  const detailGraphKeyRef = useRef(null)
  const cols = useResponsiveGridCols(gridRef)
  const [page, setPage] = useState(1)
  const [stableDetailGraphData, setStableDetailGraphData] = useState(null)

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
  const modelSignature = useMemo(
    () => buildTask2ModelSignature(snap, snapshots, descriptors, selectedModel),
    [snap, snapshots, descriptors, selectedModel]
  )
  const focusBuckets = useMemo(
    () => buildTask2FocusBuckets({ snapshot: snap, graphs: indexedGraphs }),
    [snap, indexedGraphs]
  )
  const resolvedFocusId = forcedFocus || focusMode
  const resolvedClassFilter = forcedClassFilter ?? classFilter
  const resolvedSelectedCell = forcedSelectedCell ?? selectedCell
  const activeFocus = focusBuckets.find((bucket) => bucket.id === resolvedFocusId) || focusBuckets[0] || {
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
    if (resolvedClassFilter === 'all') return focusDescriptors
    return focusDescriptors.filter((descriptor) => descriptor.groundTruth === Number(resolvedClassFilter))
  }, [focusDescriptors, resolvedClassFilter])

  const activeGallerySort = forcedGallerySort || gallerySort

  const sortedDescriptors = useMemo(
    () => sortTask2Descriptors(filteredDescriptors, activeGallerySort),
    [filteredDescriptors, activeGallerySort]
  )

  const selectedCellMatches = useMemo(
    () => sortedDescriptors.filter((descriptor) => matchesCell(descriptor, resolvedSelectedCell)),
    [resolvedSelectedCell, sortedDescriptors]
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
    if (showFullCollection) return undefined
    setPage((current) => Math.min(Math.max(current, 1), totalPages))
    return undefined
  }, [showFullCollection, totalPages])

  useEffect(() => {
    if (showFullCollection) return undefined
    setPage(1)
    return undefined
  }, [showFullCollection, resolvedFocusId, activeGallerySort, resolvedClassFilter, resolvedSelectedCell, graphs.length])

  const selectedGraph = useMemo(
    () => {
      if (showGalleryOnly) return null
      return descriptors.find((descriptor) => descriptor.originalGraphId === selectedNodeId) || null
    },
    [showGalleryOnly, descriptors, selectedNodeId]
  )

  const detailGraphKey = useMemo(() => buildDetailGraphStructureKey(selectedGraph), [selectedGraph])

  const contributions = snap?.node_contributions || []

  useEffect(() => {
    if (!selectedGraph || !detailGraphKey) {
      detailGraphKeyRef.current = null
      setStableDetailGraphData(null)
      return
    }

    if (detailGraphKeyRef.current === detailGraphKey) return

    detailGraphKeyRef.current = detailGraphKey
    setStableDetailGraphData(createStableDetailGraphData(selectedGraph))
  }, [detailGraphKey, selectedGraph])

  useEffect(() => {
    if (reportLang !== 'vi' || !panelRootRef.current) return undefined
    const rafId = window.requestAnimationFrame(() => {
      localizeTask2Element(panelRootRef.current, reportLang)
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [
    reportMode,
    reportLang,
    page,
    cols,
    selectedNodeId,
    sortedDescriptors.length,
    resolvedSelectedCell?.pred,
    resolvedSelectedCell?.gt,
    resolvedFocusId,
    activeGallerySort,
    resolvedClassFilter,
  ])

  if (!descriptors.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs bg-panel">
        No graph data
      </div>
    )
  }

  if (selectedGraph && stableDetailGraphData) {
    const predictionLabel = selectedGraph.predicted != null
      ? labelForClass(selectedGraph.predicted)
      : 'Pending'

    return (
      <div ref={panelRootRef} className="w-full h-full overflow-hidden bg-[linear-gradient(180deg,#07111f,#081322)] p-6 pt-16">
        <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] gap-4">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-line-subtle bg-deep/72 px-4 py-3 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="shrink-0 rounded-full border border-line-default/70 bg-nebula px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-slate-200 transition-colors hover:border-cyan-400/50 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              Back to gallery
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">Selected graph</div>
              <div className="mt-0.5 truncate text-sm font-black tracking-tight text-white">{`Graph #${selectedGraph.originalGraphId}`}</div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-[10px] font-mono text-slate-300">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-cyan-200">{`#${selectedGraph.originalGraphId}`}</span>
              <span className="rounded-full border border-line-subtle bg-nebula px-2.5 py-1">GT {labelForClass(selectedGraph.groundTruth)}</span>
              <span className={`rounded-full border px-2.5 py-1 ${selectedGraph.correct === 1 ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300' : 'border-rose-400/25 bg-rose-500/10 text-rose-300'}`}>
                <span className="text-slate-500">Pred</span> <b>{predictionLabel}</b>
              </span>
              <span className="rounded-full border border-line-subtle bg-nebula px-2.5 py-1">{((selectedGraph.confidence ?? 0) * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div className="relative min-h-0 overflow-hidden rounded-[28px] border border-cyan-300/18 bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.10),transparent_46%),rgba(15,23,42,0.30)]">
            <div className="pointer-events-none absolute inset-5 rounded-[24px] border border-white/5" />
            <div className="absolute inset-x-8 inset-y-6 z-10">
              <DetailGraphSVG
                graph={{ ...selectedGraph, nodes: stableDetailGraphData.nodes, links: stableDetailGraphData.links }}
                contributions={contributions[selectedGraph.sourceIndex] || []}
                modelSignature={modelSignature}
                onNodeHover={setHoveredNode}
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="rounded-2xl border border-cyan-300/18 bg-deep/72 px-4 py-3 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">{modelSignature.primaryLabel}</span>
                <span className="font-mono text-[11px] font-bold text-slate-200">{(modelSignature.currentScore * 100).toFixed(0)}%</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{modelSignature.explanation}</p>
            </div>
            <div className="rounded-2xl border border-line-subtle bg-deep/72 px-4 py-3 text-[11px] font-semibold text-slate-400 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Nodes / edges</span>
                <span className="font-mono text-cyan-200">{selectedGraph.nodes.length} / {selectedGraph.links.length}</span>
              </div>
              <div className="mt-2 line-clamp-2 text-slate-500">{selectedGraph.motifSignature}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }
  const classFilterOptions = Array.from(
    new Set(descriptors.map((descriptor) => descriptor.groundTruth).filter(Number.isInteger))
  ).sort((a, b) => a - b)

  return (
    <div
      ref={(node) => {
        panelRootRef.current = node
        gridRef.current = node
      }}
      className="w-full h-full overflow-y-auto bg-panel custom-scrollbar"
    >
      <div className="pt-16 pb-6 px-6">
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line-subtle bg-nebula/35 px-4 py-3">
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
                {resolvedSelectedCell
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
                  className="rounded-md border border-line-default px-3 py-1.5 text-micro font-bold uppercase tracking-wide text-slate-400 transition-colors hover:border-line-default hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
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
                  className="rounded-md border border-line-default px-3 py-1.5 text-micro font-bold uppercase tracking-wide text-slate-400 transition-colors hover:border-line-default hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
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
                        : 'border-line-default bg-nebula text-slate-400 hover:border-line-default hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="uppercase tracking-ultra text-slate-500">GT class</span>
                <select
                  value={resolvedClassFilter}
                  onChange={(event) => setClassFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}
                  className="rounded-md border border-line-default bg-nebula px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
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
            const matched = matchesCell(descriptor, resolvedSelectedCell)
            const confidence = descriptor.confidence || 0
            const selected = descriptor.originalGraphId === selectedNodeId
            const predictionLabel = descriptor.predicted != null
              ? labelForClass(descriptor.predicted)
              : 'Pending'
            const isWrong = descriptor.correct !== 1
            const isDanger = isWrong && confidence >= 0.85
            const isUncertain = !isWrong && confidence < 0.55
            const statusLabel = isDanger
              ? 'Danger'
              : isWrong
                ? 'Wrong'
                : isUncertain
                  ? 'Uncertain'
                  : 'Correct'
            const quickTone = isDanger
              ? 'border-rose-500/70 hover:border-rose-400 shadow-[0_0_18px_-6px_rgba(244,63,94,0.55)]'
              : isWrong
                ? 'border-amber-500/40 hover:border-amber-400/70'
                : isUncertain
                  ? 'border-slate-500/30 hover:border-slate-400/60'
                  : 'border-emerald-500/30 hover:border-emerald-500/60'
            const statusBadgeTone = isDanger
              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40'
              : isWrong
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : isUncertain
                  ? 'bg-slate-500/15 text-slate-300 border border-slate-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'

            return (
              <button
                type="button"
                key={descriptor.originalGraphId}
                onClick={() => setSelectedNode(descriptor.originalGraphId)}
                className={`group relative rounded-lg border text-left transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
                  selected
                    ? 'ring-2 ring-cyan-500/35 bg-nebula'
                    : `bg-nebula ${quickTone}`
                } ${matched ? 'opacity-100' : 'opacity-45'}`}
                title={`G#${descriptor.originalGraphId} \u2014 ${statusLabel} (conf ${(confidence * 100).toFixed(0)}%)`}
              >
                <div className="h-28 p-3 relative">
                  <MiniGraphSVG
                    nodes={descriptor.nodes}
                    links={descriptor.links}
                    contributions={contributions[descriptor.sourceIndex]}
                    modelSignature={modelSignature}
                  />
                  <div className="absolute left-3 top-3 rounded-full border border-line-default bg-nebula/82 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-200">
                    {modelSignature.shortLabel}
                  </div>
                  {modelSignature.id === 'SAGE' && modelSignature.unstableGraphIds.includes(descriptor.originalGraphId) && (
                    <div className="absolute right-3 top-3 rounded-full border border-emerald-400/30 bg-emerald-500/14 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-200">
                      Graph dao động
                    </div>
                  )}
                </div>

                <div className="px-3 py-2 border-t border-line-subtle">
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
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${statusBadgeTone}`}>
                        {statusLabel}
                      </span>
                    </div>
                    {descriptor.correctnessMismatch && (
                      <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-200">
                        Correctness schema mismatch; using pred/GT check.
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-line-default bg-nebula px-2 py-0.5 text-[10px] text-slate-300">
                      margin {((descriptor.margin ?? 0) * 100).toFixed(0)}%
                    </span>
                    <span className="rounded-full border border-line-default bg-nebula px-2 py-0.5 text-[10px] text-slate-300">
                      {descriptor.densityBucket}
                    </span>
                    <span className="rounded-full border border-line-default bg-nebula px-2 py-0.5 text-[10px] text-slate-300">
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
