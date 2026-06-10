import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { useLanguage } from '../../contexts/LanguageContext'
import { interpolateSnapshots } from '../../engine/interpolate'
import {
  buildTask2FocusBuckets,
  buildTask2GraphDescriptors,
  buildTask2GraphEpochFrame,
  buildTask2GraphEpochHistory,
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

function DetailGraphSVG({
  graph,
  frame = null,
  modelSignature = null,
  onNodeHover,
  currentEpochFloat = 0,
  motionClock = 0,
  animated = false,
  zoom = 1,
  pan = { x: 0, y: 0 },
  onWheel = null,
}) {
  const contributions = frame?.contributions || []
  const contributionDelta = frame?.contributionDelta || []
  const topContributorIds = frame?.topContributorIds || new Set()
  const modelId = modelSignature?.id || 'GCN'
  const positions = useMemo(() => {
    const map = {}
    graph.nodes.forEach((node) => {
      map[node.id] = { x: node.x || 0, y: node.y || 0 }
    })
    return map
  }, [graph.nodes])
  const animatedPositions = useMemo(() => {
    if (!animated) return positions
    const map = {}
    const modelMultiplier = modelId === 'GAT' ? 1.18 : modelId === 'SAGE' ? 0.86 : 0.96
    const visualTime = currentEpochFloat + motionClock * 0.72
    graph.nodes.forEach((node, index) => {
      const base = positions[node.id] || { x: 0, y: 0 }
      const weight = Math.max(0, Math.min(1, contributions[node.id] || 0))
      const phase = visualTime * (1.08 + weight * 0.32) + index * 1.618
      const radius = (2 + weight * 5.8) * modelMultiplier
      const driftX = Math.cos(phase) * radius + Math.sin(phase * 0.37) * radius * 0.22
      const driftY = Math.sin(phase * 0.86) * radius + Math.cos(phase * 0.31) * radius * 0.18
      map[node.id] = {
        x: base.x + driftX,
        y: base.y + driftY,
      }
    })
    return map
  }, [animated, positions, graph.nodes, contributions, currentEpochFloat, motionClock, modelId])
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
  const viewBox = useMemo(() => {
    const safeZoom = Math.max(0.65, Math.min(2.8, Number(zoom) || 1))
    const width = bounds.width / safeZoom
    const height = bounds.height / safeZoom
    return {
      x: bounds.x + ((bounds.width - width) / 2) + (Number(pan?.x) || 0),
      y: bounds.y + ((bounds.height - height) / 2) + (Number(pan?.y) || 0),
      width,
      height,
    }
  }, [bounds, zoom, pan])

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="drop-shadow-[0_24px_60px_rgba(8,47,73,0.28)]"
      role="img"
      aria-label={`${animated ? 'Animated ' : ''}Graph ${graph.originalGraphId} structure`}
      onWheel={onWheel}
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
        const from = animatedPositions[source]
        const to = animatedPositions[target]
        if (!from || !to) return null
        const weight = ((contributions[source] || 0) + (contributions[target] || 0)) / 2
        const stroke = modelId === 'GAT' && weight > 0.5
          ? 'rgba(251,191,36,0.56)'
          : modelId === 'SAGE' && weight > 0.36
            ? 'rgba(52,211,153,0.42)'
            : 'rgba(34,211,238,0.28)'
        return (
          <line
            key={`${source}-${target}-${index}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={stroke}
            strokeWidth={1.1 + weight * (modelId === 'GAT' ? 2.4 : 1.6)}
            strokeLinecap="round"
            strokeDasharray={modelId === 'SAGE' && weight > 0.35 ? '5 5' : undefined}
            style={{ transition: 'stroke 90ms linear, stroke-width 90ms linear, opacity 90ms linear' }}
          />
        )
      })}
      {graph.nodes.map((node) => {
        const point = animatedPositions[node.id]
        if (!point) return null
        const weight = Math.max(0, Math.min(1, contributions[node.id] || 0))
        const delta = contributionDelta[node.id] || 0
        const isTop = topContributorIds.has(node.id)
        const isFocus = weight >= 0.48 || isTop
        const fill = modelId === 'SAGE'
          ? (isTop ? '#bbf7d0' : isFocus ? '#34d399' : '#60a5fa')
          : modelId === 'GAT'
            ? (isTop ? '#fef3c7' : isFocus ? '#f59e0b' : '#3b82f6')
            : (isFocus ? '#67e8f9' : '#3b82f6')
        const halo = modelId === 'GCN'
          ? 'rgba(34,211,238,0.24)'
          : modelId === 'GAT'
            ? 'rgba(251,191,36,0.24)'
            : 'rgba(52,211,153,0.20)'
        const size = 7 + weight * 10
        const label = node.original_id !== undefined ? node.original_id : node.id
        return (
          <g
            key={node.id}
            onMouseEnter={() => onNodeHover?.(node.id)}
            onMouseLeave={() => onNodeHover?.(null)}
            className="cursor-default"
            style={{ transition: 'opacity 90ms linear' }}
          >
            {modelId === 'SAGE' && isFocus && (
              <circle
                cx={point.x}
                cy={point.y}
                r={size + 11}
                fill="none"
                stroke="#34d399"
                strokeWidth="1.4"
              opacity="0.28"
              strokeDasharray="5 5"
                style={{ transition: 'r 90ms linear, opacity 90ms linear, stroke 90ms linear' }}
              />
            )}
            <circle
              cx={point.x}
              cy={point.y}
              r={size + 8 + Math.max(0, delta) * 22}
              fill={halo}
              opacity={isFocus ? 0.28 : 0.08}
              filter={`url(#task2-node-glow-${graph.originalGraphId})`}
              style={{ transition: 'r 90ms linear, fill 90ms linear, opacity 90ms linear' }}
            />
            {delta > 0.08 && (
              <circle
                cx={point.x}
                cy={point.y}
                r={size + 15}
                fill="none"
                stroke={modelId === 'GAT' ? '#fbbf24' : '#22d3ee'}
                strokeWidth="2"
                opacity="0.65"
                style={{ transition: 'r 80ms linear, opacity 80ms linear' }}
              />
            )}
            <circle
              cx={point.x}
              cy={point.y}
              r={size}
              fill={fill}
              stroke={isTop ? 'rgba(255,255,255,0.92)' : 'rgba(226,232,240,0.55)'}
              strokeWidth={isTop ? 2 : 1.2}
              style={{ transition: 'r 90ms linear, fill 90ms linear, stroke 90ms linear, stroke-width 90ms linear' }}
            />
            <text
              x={point.x}
              y={point.y + 0.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isTop || (modelId === 'GAT' && isFocus) ? '#0f172a' : '#ffffff'}
              fontSize={Math.max(9, size * 0.78)}
              fontWeight="800"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              style={{ transition: 'fill 90ms linear, font-size 90ms linear' }}
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Sparkline({ values = [], tone = '#22d3ee', label = 'sparkline' }) {
  const clean = values.map((value) => (Number.isFinite(value) ? value : 0))
  const width = 150
  const height = 44
  const pad = 5
  const max = Math.max(1, ...clean)
  const min = Math.min(0, ...clean)
  const range = Math.max(0.001, max - min)
  const points = clean.length
    ? clean.map((value, index) => {
      const x = clean.length === 1 ? width / 2 : pad + (index / (clean.length - 1)) * (width - pad * 2)
      const y = height - pad - ((value - min) / range) * (height - pad * 2)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ')
    : ''

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-full" role="img" aria-label={label}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="rgba(148,163,184,0.18)" />
      {points && <polyline points={points} fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {clean.map((value, index) => {
        if (index !== clean.length - 1) return null
        const x = clean.length === 1 ? width / 2 : pad + (index / (clean.length - 1)) * (width - pad * 2)
        const y = height - pad - ((value - min) / range) * (height - pad * 2)
        return <circle key={index} cx={x} cy={y} r="3.2" fill={tone} />
      })}
    </svg>
  )
}

function CorrectnessStrip({ history = [], currentEpochFloat = 0 }) {
  const activeIndex = Math.max(0, Math.min(history.length - 1, Math.round(currentEpochFloat)))
  return (
    <div className="flex h-8 min-w-0 items-end gap-1 overflow-hidden" aria-label="Correctness epoch strip">
      {history.map((item, index) => {
        const active = index === activeIndex
        const color = item.correct === 1 ? 'bg-emerald-400' : item.correct === 0 ? 'bg-rose-400' : 'bg-slate-600'
        return (
          <div
            key={`${item.epoch}-${index}`}
            className={`min-w-0 flex-1 rounded-full ${color} ${active ? 'h-8 ring-2 ring-white/70' : 'h-4 opacity-70'}`}
            title={`Epoch ${item.epoch}: ${item.correct === 1 ? 'correct' : item.correct === 0 ? 'wrong' : 'unknown'}`}
          />
        )
      })}
    </div>
  )
}

function MetricBar({ label, value = 0, tone = 'bg-cyan-400' }) {
  const pct = Math.max(0, Math.min(1, value || 0))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <span>{label}</span>
        <span className="font-mono text-slate-200">{(pct * 100).toFixed(0)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-900/80">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct * 100}%`, transition: 'width 220ms ease' }} />
      </div>
    </div>
  )
}

function LearningTimeline({ history = [], frame = null, currentEpochFloat = 0 }) {
  const confidenceValues = history.map((item) => item.confidence ?? 0)
  const entropyValues = history.map((item) => item.entropy ?? 0)
  const readoutValues = history.map((item) => item.readoutConcentration ?? 0)

  return (
    <div className="min-w-0 overflow-hidden rounded-[22px] border border-cyan-300/16 bg-deep/78 px-4 py-3 shadow-lg backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Learning timeline</div>
          <div className="mt-1 text-[11px] font-semibold text-slate-400">
            Epoch <span className="font-mono text-white">{(frame?.epoch ?? currentEpochFloat).toFixed(1)}</span>
            <span className="mx-2 text-slate-700">/</span>
            {frame?.correct === 1 ? 'prediction correct' : frame?.correct === 0 ? 'prediction wrong' : 'waiting for labels'}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <CorrectnessStrip history={history} currentEpochFloat={currentEpochFloat} />
        </div>
      </div>
      <div className="grid min-w-0 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-line-subtle bg-nebula/45 p-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Confidence</div>
          <Sparkline values={confidenceValues} tone="#22d3ee" label="Confidence sparkline" />
        </div>
        <div className="rounded-xl border border-line-subtle bg-nebula/45 p-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Entropy</div>
          <Sparkline values={entropyValues} tone="#f59e0b" label="Entropy sparkline" />
        </div>
        <div className="rounded-xl border border-line-subtle bg-nebula/45 p-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Readout</div>
          <Sparkline values={readoutValues} tone="#34d399" label="Readout concentration sparkline" />
        </div>
      </div>
    </div>
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

function useMotionClock(enabled) {
  const [clock, setClock] = useState(0)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return undefined
    }

    let frameId = 0
    let start = 0
    const tick = (time) => {
      if (!start) start = time
      setClock((time - start) / 1000)
      frameId = window.requestAnimationFrame(tick)
    }
    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [enabled])

  return clock
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
  const [detailTab, setDetailTab] = useState('motion')
  const [detailOverlayOpen, setDetailOverlayOpen] = useState(false)
  const [detailViewport, setDetailViewport] = useState({ zoom: 1, pan: { x: 0, y: 0 } })
  const motionClock = useMotionClock(Boolean(selectedNodeId !== null && detailTab === 'motion'))

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

  const selectedGraphHistory = useMemo(
    () => buildTask2GraphEpochHistory({ snapshots, graph: selectedGraph, classNames: graphClassNames }),
    [snapshots, selectedGraph, graphClassNames]
  )

  const selectedGraphFrame = useMemo(
    () => buildTask2GraphEpochFrame({
      snapA,
      snapB,
      currentEpochFloat,
      t: frac,
      graph: selectedGraph,
      classNames: graphClassNames,
    }),
    [snapA, snapB, currentEpochFloat, frac, selectedGraph, graphClassNames]
  )

  const contributions = snap?.node_contributions || []

  useEffect(() => {
    if (!selectedGraph || !detailGraphKey) {
      detailGraphKeyRef.current = null
      setStableDetailGraphData(null)
      setDetailViewport({ zoom: 1, pan: { x: 0, y: 0 } })
      return
    }

    if (detailGraphKeyRef.current === detailGraphKey) return

    detailGraphKeyRef.current = detailGraphKey
    setStableDetailGraphData(createStableDetailGraphData(selectedGraph))
    setDetailViewport({ zoom: 1, pan: { x: 0, y: 0 } })
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
    const predictionLabel = selectedGraphFrame?.predicted != null
      ? labelForClass(selectedGraphFrame.predicted)
      : 'Pending'
    const graphForStage = {
      ...selectedGraph,
      nodes: stableDetailGraphData.nodes,
      links: stableDetailGraphData.links,
    }
    const confidence = selectedGraphFrame?.confidence ?? selectedGraph.confidence ?? 0
    const margin = selectedGraphFrame?.margin ?? selectedGraph.margin ?? 0
    const entropy = selectedGraphFrame?.entropy ?? selectedGraph.entropy ?? 0
    const readout = selectedGraphFrame?.readoutConcentration ?? selectedGraph.readoutConcentration ?? 0
    const updateDetailZoom = (delta) => {
      setDetailViewport((current) => ({
        ...current,
        zoom: Math.max(0.7, Math.min(2.6, Number((current.zoom + delta).toFixed(2)))),
      }))
    }
    const resetDetailViewport = () => setDetailViewport({ zoom: 1, pan: { x: 0, y: 0 } })
    const handleGraphWheel = (event) => {
      event.preventDefault()
      updateDetailZoom(event.deltaY < 0 ? 0.12 : -0.12)
    }

    return (
      <div ref={panelRootRef} className="h-full w-full overflow-y-auto bg-[linear-gradient(180deg,#07111f,#081322)] px-4 pb-28 pt-16 custom-scrollbar">
        <div className="grid min-h-full grid-rows-[auto_auto_auto] gap-2">
          <div className="sticky top-0 z-40 flex items-center justify-between gap-4 rounded-xl bg-[#07111f]/84 px-1 py-2 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              Back to gallery
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-black tracking-tight text-white">{`Graph #${selectedGraph.originalGraphId}`}</div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-[10px] font-mono text-slate-300">
              <span className="rounded-full bg-white/5 px-2.5 py-1">GT {labelForClass(selectedGraph.groundTruth)}</span>
              <span className={`rounded-full px-2.5 py-1 ${selectedGraphFrame?.correct === 1 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                <span className="text-slate-500">Pred</span> <b>{predictionLabel}</b>
              </span>
              <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-cyan-200">{(confidence * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-1 py-1">
            <div className="flex rounded-full bg-white/[0.04] p-1">
              {[
                ['motion', 'Đồ thị động'],
                ['learning', 'Dòng học'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDetailTab(value)}
                  className={`rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] transition-all ${
                    detailTab === value
                      ? 'bg-cyan-300 text-slate-950'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="hidden">
              {detailTab === 'motion'
                ? 'Node chuyển động quanh layout gốc theo contribution từng epoch.'
                : 'Timeline đọc confidence, entropy, readout và trạng thái đúng/sai.'}
            </div>
          </div>

          {detailTab === 'motion' ? (
            <div className="relative h-[calc(100vh-250px)] min-h-[600px] max-h-[800px] overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.10),transparent_48%),linear-gradient(180deg,rgba(15,23,42,0.42),rgba(2,8,23,0.12))]">
              <div className="hidden" />
              <div className="hidden">
                dynamic graph · stable center
              </div>
              {!selectedGraphFrame?.hasReadoutData && (
                <div className="absolute right-6 top-6 z-20 rounded-full border border-amber-400/30 bg-amber-500/12 px-3 py-1 text-[10px] font-bold text-amber-200">
                  No readout data yet
                </div>
              )}
              <div className="absolute inset-3 z-10">
                <DetailGraphSVG
                  graph={graphForStage}
                  frame={selectedGraphFrame}
                  modelSignature={modelSignature}
                  onNodeHover={setHoveredNode}
                  currentEpochFloat={currentEpochFloat}
                  motionClock={motionClock}
                  animated
                  zoom={detailViewport.zoom}
                  pan={detailViewport.pan}
                  onWheel={handleGraphWheel}
                />
              </div>
              <div className="absolute right-5 top-5 z-20 flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-950/55 p-1 text-[10px] font-black text-slate-200 shadow-[0_8px_32px_rgba(2,8,23,0.40)] backdrop-blur-2xl">
                <button
                  type="button"
                  onClick={() => updateDetailZoom(-0.18)}
                  className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-white/10"
                  aria-label="Zoom out graph"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={resetDetailViewport}
                  className="rounded-full px-2 py-1 font-mono text-cyan-100 transition hover:bg-white/10"
                  aria-label="Reset graph zoom"
                >
                  {detailViewport.zoom.toFixed(1)}x
                </button>
                <button
                  type="button"
                  onClick={() => updateDetailZoom(0.18)}
                  className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-white/10"
                  aria-label="Zoom in graph"
                >
                  +
                </button>
              </div>
              {detailOverlayOpen ? (
                <div className="absolute bottom-3 right-5 z-20 w-[min(340px,calc(100%-40px))] rounded-2xl border border-white/12 bg-gradient-to-b from-slate-950/65 to-slate-950/55 px-4 py-3.5 shadow-[0_16px_48px_rgba(2,8,23,0.55)] backdrop-blur-2xl transition-all duration-200">
                  <div className="mb-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200">
                        {modelSignature.primaryLabel}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] font-bold text-slate-300">
                        {selectedGraph.nodes.length}n / {selectedGraph.links.length}e
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailOverlayOpen(false)}
                      className="shrink-0 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-200 transition-all hover:border-cyan-300/50 hover:text-cyan-200 hover:bg-white/[0.06]"
                    >
                      Thu gọn
                    </button>
                  </div>
                  <div className="grid gap-2">
                    <MetricBar label="Confidence" value={confidence} tone="bg-cyan-400" />
                    <MetricBar label="Margin" value={margin} tone="bg-emerald-400" />
                    <MetricBar label="Readout" value={readout} tone="bg-amber-400" />
                    <MetricBar label="Entropy" value={entropy} tone="bg-rose-400" />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[10px] font-semibold leading-relaxed text-slate-400">
                    {modelSignature.explanation}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDetailOverlayOpen(true)}
                  className="absolute bottom-3 right-5 z-20 rounded-xl border border-cyan-200/20 bg-slate-950/60 px-4 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-cyan-100 shadow-[0_12px_40px_rgba(2,8,23,0.45)] backdrop-blur-2xl transition-all hover:border-cyan-200/60 hover:bg-gradient-to-r hover:from-cyan-400 hover:to-cyan-300 hover:text-slate-950"
                >
                  Mở thông số · {(confidence * 100).toFixed(0)}%
                </button>
              )}
            </div>
          ) : (
            <div className="min-h-0">
              <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                <LearningTimeline
                  history={selectedGraphHistory}
                  frame={selectedGraphFrame}
                  currentEpochFloat={currentEpochFloat}
                />
                <div className="grid min-w-0 gap-3 rounded-[22px] border border-line-subtle bg-deep/72 px-4 py-3 shadow-lg backdrop-blur">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">{modelSignature.primaryLabel}</span>
                      <span className="font-mono text-[11px] font-bold text-slate-200">{(modelSignature.currentScore * 100).toFixed(0)}%</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{modelSignature.explanation}</p>
                  </div>
                  <div className="grid gap-2">
                    <MetricBar label="Confidence" value={confidence} tone="bg-cyan-400" />
                    <MetricBar label="Margin" value={margin} tone="bg-emerald-400" />
                    <MetricBar label="Readout" value={readout} tone="bg-amber-400" />
                    <MetricBar label="Entropy" value={entropy} tone="bg-rose-400" />
                  </div>
                  <div className="rounded-xl border border-line-subtle bg-nebula/35 px-3 py-2 text-[11px] font-semibold text-slate-400">
                    <span className="font-mono text-cyan-200">{selectedGraph.nodes.length} nodes / {selectedGraph.links.length} edges</span>
                    <div className="mt-1 line-clamp-2 text-slate-500">{selectedGraph.motifSignature}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
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
      className="w-full h-full overflow-y-auto bg-gradient-to-b from-panel to-panel/80 custom-scrollbar"
    >
      <div className="pt-16 pb-6 px-6">
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-line-default/50 bg-gradient-to-b from-nebula/50 to-nebula/25 px-5 py-4 backdrop-blur-sm shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold">Graph collection</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-micro text-slate-300">
                <span className="font-bold">{sortedDescriptors.length} graphs</span>
                <span className="text-slate-600">·</span>
                <span>{graphClassNames.length || 1} class profiles</span>
                <span className="text-slate-600">·</span>
                <span className="text-cyan-300/80">{activeFocus.label}</span>
              </div>
              <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                {resolvedSelectedCell
                  ? `${selectedCellMatches.length} graphs match the active confusion cell. The rest stay visible so you can keep structural context.`
                  : activeFocus.description}
              </div>
            </div>
            {showFullCollection ? (
              <div className="rounded-lg border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-cyan-500/5 px-3 py-1.5 text-micro font-bold text-cyan-200">
                Showing the full collection in one view
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-line-default/60 bg-white/[0.03] px-3 py-1.5 text-micro font-bold uppercase tracking-wide text-slate-400 transition-all hover:border-line-default hover:bg-white/[0.06] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
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
                  className="rounded-lg border border-line-default/60 bg-white/[0.03] px-3 py-1.5 text-micro font-bold uppercase tracking-wide text-slate-400 transition-all hover:border-line-default hover:bg-white/[0.06] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
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
                    className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold transition-all duration-200 ${
                      activeGallerySort === value
                        ? 'border-cyan-400/25 bg-gradient-to-b from-cyan-500/14 to-cyan-500/6 text-cyan-200 shadow-[0_1px_4px_rgba(6,182,212,0.08)]'
                        : 'border-line-default/50 bg-white/[0.02] text-slate-400 hover:border-line-default hover:text-slate-200 hover:bg-white/[0.04]'
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
                  className="rounded-lg border border-line-default/50 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-colors hover:border-line-default"
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
                className={`group relative rounded-2xl border text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                  selected
                    ? 'ring-2 ring-cyan-500/30 bg-gradient-to-b from-nebula/80 to-nebula/50 shadow-[0_4px_20px_rgba(6,182,212,0.10)]'
                    : `bg-gradient-to-b from-nebula/60 to-nebula/30 ${quickTone}`
                } ${matched ? 'opacity-100' : 'opacity-35'}`}
                title={`G#${descriptor.originalGraphId} \u2014 ${statusLabel} (conf ${(confidence * 100).toFixed(0)}%)`}
              >
                <div className="h-28 p-3 relative bg-gradient-to-b from-black/5 to-transparent rounded-t-2xl">
                  <MiniGraphSVG
                    nodes={descriptor.nodes}
                    links={descriptor.links}
                    contributions={contributions[descriptor.sourceIndex]}
                    modelSignature={modelSignature}
                  />
                  <div className="absolute left-3 top-3 rounded-lg border border-line-default/50 bg-slate-950/60 backdrop-blur-sm px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-200">
                    {modelSignature.shortLabel}
                  </div>
                  {modelSignature.id === 'SAGE' && modelSignature.unstableGraphIds.includes(descriptor.originalGraphId) && (
                    <div className="absolute right-3 top-3 rounded-full border border-emerald-400/30 bg-emerald-500/14 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-200">
                      Graph dao động
                    </div>
                  )}
                </div>

                <div className="px-3.5 py-2.5 border-t border-line-subtle/40">
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

                  <div className="mt-2.5 flex flex-wrap gap-1">
                    <span className="rounded-md border border-line-default/40 bg-black/15 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                      margin {((descriptor.margin ?? 0) * 100).toFixed(0)}%
                    </span>
                    <span className="rounded-md border border-line-default/40 bg-black/15 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                      {descriptor.densityBucket}
                    </span>
                    <span className="rounded-md border border-line-default/40 bg-black/15 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                      {descriptor.entropyBucket}
                    </span>
                  </div>

                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500 line-clamp-1">
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
