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
import { localizeTask2Element, translateTask2ReportText } from '../../utils/task2ReportI18n'

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

function formatFailureTag(tag, lang) {
  if (lang === 'vi') {
    switch (tag) {
      case 'overconfident_miss': return 'sai nhưng quá tự tin'
      case 'boundary_case': return 'ca vùng biên'
      case 'diffuse_readout': return 'readout loãng'
      case 'structural_outlier': return 'ngoại lệ cấu trúc'
      case 'stable_win':
      default: return 'ca ổn định'
    }
  }
  switch (tag) {
    case 'overconfident_miss': return 'overconfident miss'
    case 'boundary_case': return 'boundary case'
    case 'diffuse_readout': return 'diffuse readout'
    case 'structural_outlier': return 'structural outlier'
    case 'stable_win':
    default: return 'stable win'
  }
}

function getEntropyQuality(value, lang) {
  const pct = (value || 0) * 100
  if (lang === 'vi') {
    if (pct < 20) return { label: 'Tập trung cao', tone: 'text-emerald-300', desc: 'Mô hình gần như chắc chắn.' }
    if (pct < 40) return { label: 'Tương đối tập trung', tone: 'text-emerald-200', desc: 'Mô hình vẫn tự tin, ít mơ hồ.' }
    if (pct < 60) return { label: 'Trung bình', tone: 'text-amber-200', desc: 'Có mức mơ hồ vừa phải.' }
    if (pct < 80) return { label: 'Hơi loãng', tone: 'text-orange-300', desc: 'Mô hình đang phân vân giữa nhiều lớp.' }
    return { label: 'Rất loãng', tone: 'text-rose-300', desc: 'Mô hình không có tín hiệu rõ ràng.' }
  }
  if (pct < 20) return { label: 'High focus', tone: 'text-emerald-300', desc: 'Near-certain prediction.' }
  if (pct < 40) return { label: 'Low uncertainty', tone: 'text-emerald-200', desc: 'Model is fairly confident.' }
  if (pct < 60) return { label: 'Moderate', tone: 'text-amber-200', desc: 'Some ambiguity present.' }
  if (pct < 80) return { label: 'Elevated', tone: 'text-orange-300', desc: 'Model is uncertain between classes.' }
  return { label: 'Very diffuse', tone: 'text-rose-300', desc: 'No clear signal.' }
}

function getMarginQuality(value, lang) {
  const pct = (value || 0) * 100
  if (lang === 'vi') {
    if (pct >= 60) return { label: 'An toàn', tone: 'text-emerald-300', desc: 'Khoảng cách lớn, dự đoán rõ ràng.' }
    if (pct >= 40) return { label: 'Khá ổn', tone: 'text-emerald-200', desc: 'Dự đoán tương đối tự tin.' }
    if (pct >= 25) return { label: 'Hơi mỏng', tone: 'text-amber-200', desc: 'Gần ranh giới quyết định.' }
    if (pct >= 10) return { label: 'Mỏng', tone: 'text-orange-300', desc: 'Dễ bị nhầm nếu nhiễu nhẹ.' }
    return { label: 'Rất rủi ro', tone: 'text-rose-300', desc: 'Nằm ngay ranh giới quyết định.' }
  }
  if (pct >= 60) return { label: 'Safe', tone: 'text-emerald-300', desc: 'Wide gap, clear prediction.' }
  if (pct >= 40) return { label: 'Moderate', tone: 'text-emerald-200', desc: 'Reasonably confident.' }
  if (pct >= 25) return { label: 'Thin margin', tone: 'text-amber-200', desc: 'Near decision boundary.' }
  if (pct >= 10) return { label: 'Narrow', tone: 'text-orange-300', desc: 'Sensitive to small noise.' }
  return { label: 'Very risky', tone: 'text-rose-300', desc: 'Right on the decision boundary.' }
}

function getConfidenceQuality(value, lang) {
  const pct = (value || 0) * 100
  if (lang === 'vi') {
    if (pct >= 85) return { label: 'Rất tự tin', tone: 'text-emerald-300' }
    if (pct >= 65) return { label: 'Tự tin', tone: 'text-emerald-200' }
    if (pct >= 45) return { label: 'Trung bình', tone: 'text-amber-200' }
    if (pct >= 25) return { label: 'Thấp', tone: 'text-orange-300' }
    return { label: 'Rất thấp', tone: 'text-rose-300' }
  }
  if (pct >= 85) return { label: 'Very high', tone: 'text-emerald-300' }
  if (pct >= 65) return { label: 'High', tone: 'text-emerald-200' }
  if (pct >= 45) return { label: 'Moderate', tone: 'text-amber-200' }
  if (pct >= 25) return { label: 'Low', tone: 'text-orange-300' }
  return { label: 'Very low', tone: 'text-rose-300' }
}

function getReadoutQuality(value, lang) {
  const pct = (value || 0) * 100
  if (lang === 'vi') {
    if (pct >= 70) return { label: 'Rất tập trung', tone: 'text-emerald-300', desc: 'Vài nút chi phối toàn bộ readout.' }
    if (pct >= 45) return { label: 'Tập trung', tone: 'text-emerald-200', desc: 'Readout có trọng tâm rõ.' }
    if (pct >= 25) return { label: 'Trung bình', tone: 'text-amber-200', desc: 'Phân bố vừa phải.' }
    return { label: 'Loãng', tone: 'text-orange-300', desc: 'Nhiều nút yếu đóng góp đều.' }
  }
  if (pct >= 70) return { label: 'Highly focused', tone: 'text-emerald-300', desc: 'Few nodes dominate readout.' }
  if (pct >= 45) return { label: 'Focused', tone: 'text-emerald-200', desc: 'Clear readout center.' }
  if (pct >= 25) return { label: 'Moderate', tone: 'text-amber-200', desc: 'Balanced distribution.' }
  return { label: 'Diffuse', tone: 'text-orange-300', desc: 'Many weak contributors.' }
}

function t(text, lang) {
  return translateTask2ReportText(text, lang) || text
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
  const modelTheme = modelId === 'GAT'
    ? {
        edge: 'rgba(251,191,36,0.58)',
        edgeSoft: 'rgba(251,191,36,0.24)',
        node: '#f59e0b',
        nodeSoft: '#fef3c7',
        halo: 'rgba(251,191,36,0.24)',
      }
    : modelId === 'SAGE'
      ? {
          edge: 'rgba(52,211,153,0.52)',
          edgeSoft: 'rgba(52,211,153,0.2)',
          node: '#34d399',
          nodeSoft: '#bbf7d0',
          halo: 'rgba(52,211,153,0.22)',
        }
      : {
          edge: 'rgba(34,211,238,0.38)',
          edgeSoft: 'rgba(34,211,238,0.16)',
          node: '#67e8f9',
          nodeSoft: '#dbeafe',
          halo: 'rgba(34,211,238,0.2)',
        }
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
    const modelMultiplier = modelId === 'GAT' ? 0.96 : modelId === 'SAGE' ? 0.54 : 0.72
    const visualTime = currentEpochFloat + motionClock * 0.34
    graph.nodes.forEach((node, index) => {
      const base = positions[node.id] || { x: 0, y: 0 }
      const weight = Math.max(0, Math.min(1, contributions[node.id] || 0))
      const phase = visualTime * (0.74 + weight * 0.16) + index * 1.618
      const radius = (0.55 + weight * 2.1) * modelMultiplier
      const driftX = Math.cos(phase) * radius + Math.sin(phase * 0.37) * radius * 0.08
      const driftY = Math.sin(phase * 0.86) * radius + Math.cos(phase * 0.31) * radius * 0.07
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
        const stroke = weight > 0.44 ? modelTheme.edge : modelTheme.edgeSoft
        return (
          <line
            key={`${source}-${target}-${index}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={stroke}
            strokeWidth={modelId === 'GAT' ? 1 + weight * 2.6 : modelId === 'SAGE' ? 0.9 + weight * 1.4 : 1.1 + weight * 1.9}
            strokeLinecap="round"
            strokeDasharray={modelId === 'SAGE' ? '5 5' : undefined}
            style={{ transition: 'stroke 260ms ease, stroke-width 260ms ease, opacity 260ms ease' }}
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
        const fill = isTop ? modelTheme.nodeSoft : isFocus ? modelTheme.node : '#3b82f6'
        const halo = modelTheme.halo
        const size = modelId === 'SAGE' ? 6.3 + weight * 9 : modelId === 'GAT' ? 7.2 + weight * 10.8 : 6.8 + weight * 9.8
        const label = node.original_id !== undefined ? node.original_id : node.id
        return (
          <g
            key={node.id}
            onMouseEnter={() => onNodeHover?.(node.id)}
            onMouseLeave={() => onNodeHover?.(null)}
            className="cursor-default"
            style={{ transition: 'opacity 220ms ease' }}
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
                style={{ transition: 'r 260ms ease, opacity 260ms ease, stroke 260ms ease' }}
              />
            )}
            <circle
              cx={point.x}
              cy={point.y}
              r={size + 8 + Math.max(0, delta) * 22}
              fill={halo}
              opacity={isFocus ? 0.28 : 0.08}
              filter={`url(#task2-node-glow-${graph.originalGraphId})`}
              style={{ transition: 'r 260ms ease, fill 260ms ease, opacity 260ms ease' }}
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
                style={{ transition: 'r 220ms ease, opacity 220ms ease' }}
              />
            )}
            <circle
              cx={point.x}
              cy={point.y}
              r={size}
              fill={fill}
              stroke={isTop ? 'rgba(255,255,255,0.92)' : 'rgba(226,232,240,0.55)'}
              strokeWidth={isTop ? 2 : 1.2}
              style={{ transition: 'r 260ms ease, fill 260ms ease, stroke 260ms ease, stroke-width 260ms ease' }}
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
              style={{ transition: 'fill 260ms ease, font-size 260ms ease' }}
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

function MetricBar({ label, value = 0, tone = 'bg-cyan-400', quality = null, tooltip = null }) {
  const pct = Math.max(0, Math.min(1, value || 0))
  return (
    <div title={tooltip || undefined}>
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <span>{label}</span>
        <div className="flex items-center gap-1.5">
          {quality?.label && (
            <span className={`normal-case tracking-normal text-[9px] font-semibold ${quality.tone || 'text-slate-400'}`}>
              {quality.label}
            </span>
          )}
          <span className="font-mono text-slate-200">{(pct * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-900/80">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct * 100}%`, transition: 'width 220ms ease' }} />
      </div>
      {quality?.desc && (
        <div className="mt-0.5 text-[9px] text-slate-600">{quality.desc}</div>
      )}
    </div>
  )
}

function LearningTimeline({ history = [], frame = null, currentEpochFloat = 0, compact = false, lang = 'en' }) {
  const confidenceValues = history.map((item) => item.confidence ?? 0)
  const entropyValues = history.map((item) => item.entropy ?? 0)
  const readoutValues = history.map((item) => item.readoutConcentration ?? 0)
  const activeEpoch = (frame?.epoch ?? currentEpochFloat).toFixed(1)
  const statusLabel = frame?.correct === 1
    ? t('Stable', lang)
    : frame?.correct === 0
      ? t('Risk', lang)
      : t('Pending', lang)
  const statusTone = frame?.correct === 1
    ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
    : frame?.correct === 0
      ? 'text-rose-300 bg-rose-500/10 border-rose-500/20'
      : 'text-slate-300 bg-slate-500/10 border-slate-500/20'
  const topContribId = frame?.topContributors?.[0]?.nodeId
  const contribCount = frame?.topContributors?.length || 0
  const contribTooltip = lang === 'vi'
    ? `Nút đóng góp chính${topContribId != null ? `: nút ${topContribId}` : ''}${contribCount > 1 ? ` (top ${contribCount})` : ''}`
    : `Top contributing node${topContribId != null ? `: node ${topContribId}` : ''}${contribCount > 1 ? ` (top ${contribCount})` : ''}`
  const entropyQuality = getEntropyQuality(frame?.entropy ?? 0, lang)
  const readoutQuality = getReadoutQuality(frame?.readoutConcentration ?? 0, lang)
  const marginQuality = getMarginQuality(frame?.margin ?? 0, lang)

  return (
    <div className={`min-w-0 overflow-hidden rounded-[20px] border border-cyan-300/12 bg-[linear-gradient(180deg,rgba(8,18,33,0.92),rgba(6,13,25,0.9))] shadow-[0_12px_36px_rgba(2,8,23,0.24)] backdrop-blur ${compact ? 'px-3 py-3' : 'px-4 py-3'}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-300/90">{t('Learning Timeline', lang)}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-mono text-white">
              E{activeEpoch}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 pt-0.5">
          <CorrectnessStrip history={history} currentEpochFloat={currentEpochFloat} />
        </div>
      </div>
      <div className="grid min-w-0 gap-2">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5">
          <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <span>{t('Confidence', lang)}</span>
            <span className="font-mono text-cyan-200">{((frame?.confidence ?? 0) * 100).toFixed(0)}%</span>
          </div>
          <Sparkline values={confidenceValues} tone="#22d3ee" label="Confidence sparkline" />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5">
            <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <span>{t('Entropy', lang)}</span>
              <span className={`font-mono ${entropyQuality.tone}`}>{((frame?.entropy ?? 0) * 100).toFixed(0)}%</span>
            </div>
            <Sparkline values={entropyValues} tone="#f59e0b" label="Entropy sparkline" />
            <div className={`mt-0.5 text-[8px] font-medium ${entropyQuality.tone}`}>{entropyQuality.label}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5">
            <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <span>{t('Readout', lang)}</span>
              <span className={`font-mono ${readoutQuality.tone}`}>{((frame?.readoutConcentration ?? 0) * 100).toFixed(0)}%</span>
            </div>
            <Sparkline values={readoutValues} tone="#34d399" label="Readout concentration sparkline" />
            <div className={`mt-0.5 text-[8px] font-medium ${readoutQuality.tone}`}>{readoutQuality.label}</div>
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/[0.05] bg-black/10 px-2.5 py-2" title={marginQuality.desc}>
          <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('Margin', lang)}</div>
          <div className={`mt-1 font-mono text-[11px] ${marginQuality.tone}`}>{((frame?.margin ?? 0) * 100).toFixed(0)}%</div>
          <div className={`text-[7px] font-medium ${marginQuality.tone}`}>{marginQuality.label}</div>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-black/10 px-2.5 py-2 cursor-help" title={contribTooltip}>
          <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {lang === 'vi' ? 'Đóng góp' : 'Contrib'}
          </div>
          <div className="mt-1 font-mono text-[11px] text-cyan-200">{topContribId ?? '-'}</div>
          <div className="text-[7px] font-medium text-slate-600">
            {lang === 'vi' ? 'Nút chính' : 'Top node'}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-black/10 px-2.5 py-2">
          <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('Epochs', lang)}</div>
          <div className="mt-1 font-mono text-[11px] text-slate-200">{history.length}</div>
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
  const setHoveredGraph = useGNNStore((state) => state.setHoveredGraph)
  const setSelectedCell = useGNNStore((state) => state.setTask2SelectedCell)
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
  const [detailViewport, setDetailViewport] = useState({ zoom: 1, pan: { x: 0, y: 0 } })
  const motionClock = useMotionClock(Boolean(selectedNodeId !== null))

  const handleBackToGallery = useCallback(() => {
    setHoveredNode(null)
    setHoveredGraph(null)
    setSelectedNode(null)
  }, [setHoveredGraph, setHoveredNode, setSelectedNode])

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

  useEffect(() => {
    if (forcedFocus) return undefined
    if (resolvedFocusId === 'all') return undefined
    if (activeFocus.graphIds?.length) return undefined
    setFocusMode('all')
    return undefined
  }, [activeFocus.graphIds, forcedFocus, resolvedFocusId, setFocusMode])

  useEffect(() => {
    if (forcedSelectedCell) return undefined
    if (!resolvedSelectedCell) return undefined
    if (selectedCellMatches.length) return undefined
    setSelectedCell(null)
    return undefined
  }, [forcedSelectedCell, resolvedSelectedCell, selectedCellMatches.length, setSelectedCell])

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

  // Inline t() handles translations directly — no DOM post-processing needed
  // useEffect(() => { ... localizeTask2Element ... }) removed to avoid double-translation

  if (!descriptors.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs bg-panel">
        {t('No graph data', reportLang)}
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
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      updateDetailZoom(event.deltaY < 0 ? 0.05 : -0.05)
    }

    const confidenceQ = getConfidenceQuality(confidence, reportLang)
    const entropyQ = getEntropyQuality(entropy, reportLang)
    const marginQ = getMarginQuality(margin, reportLang)
    const readoutQ = getReadoutQuality(readout, reportLang)

    /* ── Derived labels ── */
    const isCorrect = selectedGraphFrame?.correct === 1
    const isWrong = selectedGraphFrame?.correct === 0
    const statusText = isCorrect ? t('Correct', reportLang) : isWrong ? t('Wrong', reportLang) : t('Pending', reportLang)
    const statusClasses = isCorrect
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : isWrong
        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
        : 'bg-slate-500/15 text-slate-300 border-slate-500/30'
    const topContribs = selectedGraphFrame?.topContributors || []
    const readoutConc = selectedGraphFrame?.readoutConcentration ?? 0
    const nodesL = reportLang === 'vi' ? 'nút' : 'nodes'
    const edgesL = reportLang === 'vi' ? 'cạnh' : 'edges'

    /* ── Card shell ── */
    const Card = ({ title, children, className = '' }) => (
      <div className={`rounded-[16px] border border-white/[0.06] bg-white/[0.025] p-3.5 ${className}`}>
        {title && (
          <div className="mb-2.5 text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">{title}</div>
        )}
        {children}
      </div>
    )

    return (
      <div ref={panelRootRef} className="flex h-full w-full flex-col overflow-hidden bg-[linear-gradient(180deg,#07111f,#081322)]">

        {/* ── Sticky compact header ── */}
        <div className="z-40 flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#07111f]/97 px-4 py-2.5 backdrop-blur-xl">
          <button
            type="button"
            onClick={handleBackToGallery}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            {t('Back to gallery', reportLang)}
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-black tracking-tight text-white">
            Graph #{selectedGraph.originalGraphId}
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClasses}`}>{statusText}</span>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-slate-300">
            {t('Nhãn thật', reportLang)}: <b className="text-white">{labelForClass(selectedGraph.groundTruth)}</b>
          </span>
          <span className="text-[10px] text-slate-600">&rarr;</span>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono ${isCorrect ? 'border-emerald-500/30 text-emerald-300' : isWrong ? 'border-rose-500/30 text-rose-300' : 'border-white/10 text-slate-300'}`}>
            {t('Dự đoán', reportLang)}: <b>{predictionLabel}</b>
          </span>
          <span className="shrink-0 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-200">{(confidence * 100).toFixed(0)}%</span>
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-200">{t('Biên phân loại', reportLang)} {(margin * 100).toFixed(0)}%</span>
        </div>

        {/* ── Single-column scroll ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="mx-auto max-w-[1120px] px-4 py-4 space-y-5">

            {/* ── Graph canvas ── */}
            <div className="relative overflow-hidden rounded-[24px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(9,19,36,0.94),rgba(4,12,25,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_56px_rgba(2,8,23,0.3)]" style={{ height: 'clamp(380px, 50vh, 640px)' }}>
              {!selectedGraphFrame?.hasReadoutData && (
                <div className="absolute left-4 top-4 z-20 rounded-full border border-amber-400/30 bg-amber-500/12 px-3 py-1 text-[10px] font-bold text-amber-200">
                  {reportLang === 'vi' ? 'Chưa có dữ liệu readout' : 'No readout data yet'}
                </div>
              )}
              <div className={`absolute inset-3 z-10 rounded-[20px] border border-white/[0.04] ${
                modelSignature.id === 'GAT'
                  ? 'bg-[radial-gradient(circle_at_48%_28%,rgba(251,191,36,0.14),transparent_34%),radial-gradient(circle_at_top,rgba(15,23,42,0.18),transparent_55%)]'
                  : modelSignature.id === 'SAGE'
                    ? 'bg-[radial-gradient(circle_at_45%_30%,rgba(52,211,153,0.12),transparent_34%),radial-gradient(circle_at_top,rgba(15,23,42,0.18),transparent_55%)]'
                    : 'bg-[radial-gradient(circle_at_50%_26%,rgba(34,211,238,0.14),transparent_36%),radial-gradient(circle_at_top,rgba(15,23,42,0.18),transparent_55%)]'
              }`}>
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

              {/* Zoom controls */}
              <div className="absolute right-4 top-4 z-20 flex items-center gap-0.5 rounded-xl border border-white/10 bg-slate-950/55 p-1 text-[10px] font-black text-slate-200 shadow-lg backdrop-blur-2xl">
                <button type="button" onClick={() => updateDetailZoom(-0.08)} className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-white/10" aria-label="Zoom out">-</button>
                <button type="button" onClick={resetDetailViewport} className="rounded-full px-2 py-1 font-mono text-cyan-100 transition hover:bg-white/10" aria-label="Reset zoom">{detailViewport.zoom.toFixed(1)}x</button>
                <button type="button" onClick={() => updateDetailZoom(0.08)} className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-white/10" aria-label="Zoom in">+</button>
              </div>

              {/* Node size legend */}
              <div className="absolute left-4 top-4 z-20 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-[10px] text-slate-300 shadow-lg backdrop-blur-xl">
                <div className="mb-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-slate-500">{reportLang === 'vi' ? 'Chú giải' : 'Legend'}</div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" />
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 opacity-60" />
                  <span className="text-[9px] text-slate-400">{reportLang === 'vi' ? 'Mức đóng góp' : 'Contribution level'}</span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-white/90 bg-cyan-400" />
                  <span className="text-[9px] text-slate-400">{reportLang === 'vi' ? 'Nút đóng góp chính' : 'Top contributor'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4" fill="none" stroke={modelSignature.id === 'GAT' ? '#f59e0b' : modelSignature.id === 'SAGE' ? '#34d399' : '#67e8f9'} strokeWidth="1.5" opacity="0.65" /></svg>
                  <span className="text-[9px] text-slate-400">{reportLang === 'vi' ? 'Đang tăng' : 'Rising'}</span>
                </div>
              </div>

              {/* Model badge bottom-left */}
              <div className="absolute bottom-4 left-4 z-20 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 shadow-lg backdrop-blur-xl">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-950 ${
                  modelSignature.id === 'GAT' ? 'bg-amber-300/90' : modelSignature.id === 'SAGE' ? 'bg-emerald-300/90' : 'bg-cyan-400/90'
                }`}>{modelSignature.id}</span>
                <span className="ml-2 text-[10px] font-semibold text-slate-500">{t('Motion View', reportLang)}</span>
              </div>
            </div>

            {/* ── Row: Key Metrics + Prediction Strip ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={reportLang === 'vi' ? 'Chỉ số chính' : 'Key Metrics'}>
                <div className="space-y-3">
                  <MetricBar label={t('Độ tin cậy', reportLang)} value={confidence} tone="bg-cyan-400" quality={confidenceQ} tooltip={confidenceQ.desc} />
                  <MetricBar label={t('Biên phân loại', reportLang)} value={margin} tone="bg-emerald-400" quality={marginQ} tooltip={marginQ.desc} />
                  <MetricBar label={reportLang === 'vi' ? 'Tổng hợp đồ thị' : 'Readout'} value={readout} tone="bg-amber-400" quality={readoutQ} tooltip={readoutQ.desc} />
                  <MetricBar label={t('Độ bất định', reportLang)} value={entropy} tone="bg-rose-400" quality={entropyQ} tooltip={entropyQ.desc} />
                </div>
              </Card>
              <Card title={reportLang === 'vi' ? 'Lịch sử dự đoán theo epoch' : 'Prediction Strip'}>
                <CorrectnessStrip history={selectedGraphHistory} currentEpochFloat={currentEpochFloat} />
                <div className="mt-2 flex flex-wrap items-center gap-4 text-[9px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> {reportLang === 'vi' ? 'Đúng' : 'Correct'}</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-400" /> {reportLang === 'vi' ? 'Sai' : 'Wrong'}</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-600" /> {reportLang === 'vi' ? 'Chưa rõ' : 'Unknown'}</span>
                  <span className="ml-auto font-mono text-slate-400">E{(selectedGraphFrame?.epoch ?? currentEpochFloat).toFixed(1)}</span>
                </div>
              </Card>
            </div>

            {/* ── Learning Timeline ── */}
            <Card title={t('Learning Timeline', reportLang)}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5">
                  <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    <span>{t('Độ tin cậy', reportLang)}</span>
                    <span className="font-mono text-cyan-200">{((selectedGraphFrame?.confidence ?? 0) * 100).toFixed(0)}%</span>
                  </div>
                  <Sparkline values={selectedGraphHistory.map(h => h.confidence ?? 0)} tone="#22d3ee" label="Confidence" />
                </div>
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5">
                  <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    <span>{t('Độ bất định', reportLang)}</span>
                    <span className={`font-mono ${entropyQ.tone}`}>{((selectedGraphFrame?.entropy ?? 0) * 100).toFixed(0)}%</span>
                  </div>
                  <Sparkline values={selectedGraphHistory.map(h => h.entropy ?? 0)} tone="#f59e0b" label="Entropy" />
                  <div className={`mt-0.5 text-[8px] font-medium ${entropyQ.tone}`}>{entropyQ.label}</div>
                </div>
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5">
                  <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    <span>{reportLang === 'vi' ? 'Tổng hợp' : 'Readout'}</span>
                    <span className={`font-mono ${readoutQ.tone}`}>{(readoutConc * 100).toFixed(0)}%</span>
                  </div>
                  <Sparkline values={selectedGraphHistory.map(h => h.readoutConcentration ?? 0)} tone="#34d399" label="Readout" />
                  <div className={`mt-0.5 text-[8px] font-medium ${readoutQ.tone}`}>{readoutQ.label}</div>
                </div>
              </div>
            </Card>

            {/* ── Row: Model Lens + Top Contributors + Structure ── */}
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Lăng kính mô hình */}
              <Card title={reportLang === 'vi' ? 'Lăng kính mô hình' : 'Model Lens'}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-950 ${
                    modelSignature.id === 'GAT' ? 'bg-amber-300/90' : modelSignature.id === 'SAGE' ? 'bg-emerald-300/90' : 'bg-cyan-400/90'
                  }`}>{modelSignature.id}</span>
                  <span className="font-mono text-[11px] font-bold text-slate-200">{(modelSignature.currentScore * 100).toFixed(0)}%</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400 break-words">{modelSignature.explanation}</p>
                <div className={`mt-2.5 rounded-lg border px-2.5 py-2 ${
                  modelSignature.id === 'GAT' ? 'border-amber-400/20 bg-amber-500/8'
                    : modelSignature.id === 'SAGE' ? 'border-emerald-400/20 bg-emerald-500/8'
                      : 'border-cyan-400/20 bg-cyan-500/8'
                }`}>
                  <div className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-500 mb-1">{t('Model Behavior', reportLang)}</div>
                  <div className="text-[11px] leading-relaxed text-slate-300 break-words">
                    {reportLang === 'vi'
                      ? (modelSignature.id === 'GAT'
                        ? 'Cạnh và motif chính phát sáng ấm hơn khi attention tập trung.'
                        : modelSignature.id === 'SAGE'
                          ? 'Bỏ phiếu lân cận ổn định hơn với cấu trúc nét đứt nhẹ nhàng.'
                          : 'Tín hiệu lan tỏa đều hơn với propagation cyan mượt.')
                      : (modelSignature.id === 'GAT'
                        ? 'Edges and top motifs glow warmer as attention locks in.'
                        : modelSignature.id === 'SAGE'
                          ? 'Neighborhood voting stays steadier with calmer dashed structure.'
                          : 'Signals spread more evenly with smoother cyan propagation.')}
                  </div>
                </div>
              </Card>

              {/* Nút đóng góp chính */}
              <Card title={reportLang === 'vi' ? 'Nút đóng góp chính' : 'Top Readout Nodes'}>
                {topContribs.length > 0 ? (
                  <div className="space-y-1.5">
                    {topContribs.slice(0, 5).map((contrib, i) => {
                      const w = Math.max(0, Math.min(1, contrib.weight ?? 0))
                      return (
                        <div key={contrib.nodeId ?? i} className="flex items-center gap-2 text-[11px]">
                          <span className="w-5 shrink-0 text-right font-mono text-[10px] text-slate-600">#{i + 1}</span>
                          <span className="font-mono font-bold text-white w-8">{reportLang === 'vi' ? 'nút' : 'node'} {contrib.nodeId}</span>
                          <div className="min-w-0 flex-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${w * 100}%` }} />
                          </div>
                          <span className="shrink-0 font-mono text-[10px] text-cyan-200">{(w * 100).toFixed(0)}%</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-600">{reportLang === 'vi' ? 'Chưa có dữ liệu đóng góp' : 'No contribution data'}</div>
                )}
              </Card>

              {/* Cấu trúc */}
              <Card title={reportLang === 'vi' ? 'Cấu trúc' : 'Structure'}>
                <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
                  <div>
                    <div className="text-slate-500">{reportLang === 'vi' ? 'Số nút' : 'Nodes'}</div>
                    <div className="font-mono font-bold text-white">{selectedGraph.nodes.length}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">{reportLang === 'vi' ? 'Số cạnh' : 'Edges'}</div>
                    <div className="font-mono font-bold text-white">{selectedGraph.links.length}</div>
                  </div>
                </div>
                <div className="text-[11px] leading-relaxed text-slate-400 break-words">{selectedGraph.motifSignature}</div>
                {selectedGraph.failureTag && (
                  <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[10px] text-slate-400">
                    {formatFailureTag(selectedGraph.failureTag, reportLang)}
                  </div>
                )}
              </Card>
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
      className="w-full h-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-panel to-panel/80 custom-scrollbar"
    >
      <div className="pt-16 pb-6 px-6">
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-line-default/50 bg-gradient-to-b from-nebula/50 to-nebula/25 px-5 py-4 backdrop-blur-sm shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-bold">{t('Graph collection', reportLang)}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-micro text-slate-300">
                <span className="font-bold">{sortedDescriptors.length} {t('graphs', reportLang)}</span>
                <span className="text-slate-600">·</span>
                <span>{graphClassNames.length || 1} {t('class profiles', reportLang)}</span>
                <span className="text-slate-600">·</span>
                <span className="text-cyan-300/80">{t(activeFocus.label, reportLang)}</span>
              </div>
              <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                {resolvedSelectedCell
                  ? t(`${selectedCellMatches.length} graphs match the active confusion cell. The rest stay visible so you can keep structural context.`, reportLang)
                  : t(activeFocus.description, reportLang)}
              </div>
            </div>
            {showFullCollection ? (
              <div className="rounded-lg border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-cyan-500/5 px-3 py-1.5 text-micro font-bold text-cyan-200">
                {t('Showing the full collection in one view', reportLang)}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-line-default/60 bg-white/[0.03] px-3 py-1.5 text-micro font-bold uppercase tracking-wide text-slate-400 transition-all hover:border-line-default hover:bg-white/[0.06] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {t('Prev', reportLang)}
                </button>
                <span className="min-w-[72px] text-center text-micro font-mono text-slate-400">
                  {t('Page', reportLang)} {currentPage}/{totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-line-default/60 bg-white/[0.03] px-3 py-1.5 text-micro font-bold uppercase tracking-wide text-slate-400 transition-all hover:border-line-default hover:bg-white/[0.06] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {t('Next', reportLang)}
                </button>
              </div>
            )}
          </div>

          {!hideGalleryControls && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  ['priority', t('Priority', reportLang)],
                  ['confidence_desc', t('Confidence', reportLang)],
                  ['entropy_desc', t('Entropy', reportLang)],
                  ['size_desc', t('Size', reportLang)],
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
                <span className="uppercase tracking-ultra text-slate-500">{t('GT class', reportLang)}</span>
                <select
                  value={resolvedClassFilter}
                  onChange={(event) => setClassFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}
                  className="rounded-lg border border-line-default/50 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-colors hover:border-line-default"
                >
                  <option value="all">{t('All', reportLang)}</option>
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
              : t('Pending', reportLang)
            const isWrong = descriptor.correct !== 1
            const isDanger = isWrong && confidence >= 0.85
            const isUncertain = !isWrong && confidence < 0.55
            const statusLabel = isDanger
              ? t('Danger', reportLang)
              : isWrong
                ? t('Wrong', reportLang)
                : isUncertain
                  ? t('Uncertain', reportLang)
                  : t('Correct', reportLang)
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
                      {t('Graph dao động', reportLang)}
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
                        {reportLang === 'vi' ? `${descriptor.nodes.length}nT/${descriptor.links.length}c` : `${descriptor.nodes.length}n/${descriptor.links.length}e`}
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
                      <span className="text-slate-500">{t('GT', reportLang)}</span>
                      <span>{labelForClass(descriptor.groundTruth)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">{t('Pred', reportLang)}</span>
                      <span className={descriptor.correct === 1 ? 'text-emerald-300' : 'text-red-300'}>
                        {predictionLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">{t('Status', reportLang)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${statusBadgeTone}`}>
                        {statusLabel}
                      </span>
                    </div>
                    {descriptor.correctnessMismatch && (
                      <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-200">
                        {reportLang === 'vi' ? 'Schema không khớp; đang dùng kiểm tra pred/GT.' : 'Correctness schema mismatch; using pred/GT check.'}
                      </div>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1">
                    <span className="rounded-md border border-line-default/40 bg-black/15 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                      {t('Margin', reportLang)} {((descriptor.margin ?? 0) * 100).toFixed(0)}%
                    </span>
                    <span className="rounded-md border border-line-default/40 bg-black/15 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                      {t(descriptor.densityBucket, reportLang)}
                    </span>
                    <span className="rounded-md border border-line-default/40 bg-black/15 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                      {t(descriptor.entropyBucket, reportLang)}
                    </span>
                  </div>

                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500 line-clamp-1">
                    {descriptor.motifSignature} · {formatFailureTag(descriptor.failureTag, reportLang)}
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
