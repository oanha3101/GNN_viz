const TASK3_MIN_ZOOM = 0.45
const TASK3_MAX_ZOOM = 1.5
const TASK3_NODE_SIZE_MIN = 3
const TASK3_NODE_SIZE_CAP = 8

export function selectTask3OverlayEdgeIndexes({
  testEdges = [],
  scoreA = [],
  scoreB = [],
  t = 0,
  focusedEdgeIdx = null,
  selectedNodeId = null,
  limit = 8,
}) {
  if (!Array.isArray(testEdges) || testEdges.length === 0) return []

  const rows = []
  testEdges.forEach((edge, idx) => {
    if (!edge) return
    if (
      selectedNodeId != null &&
      edge.source !== selectedNodeId &&
      edge.target !== selectedNodeId
    ) {
      return
    }

    const start = Number(scoreA[idx] ?? 0)
    const end = Number(scoreB[idx] ?? start)
    const score = start + (end - start) * t
    const novelty = edge.exists ? Math.abs(score - 1) : score
    const focusBoost = idx === focusedEdgeIdx ? 10 : 0
    const visibilityBoost = edge.exists ? 0.15 : 0.35

    rows.push({
      idx,
      source: edge.source,
      target: edge.target,
      exists: Boolean(edge.exists),
      score,
      salience: novelty + focusBoost + visibilityBoost,
    })
  })

  rows.sort((a, b) => b.salience - a.salience)

  const chosen = rows.slice(0, Math.max(1, limit))
  if (focusedEdgeIdx != null && !chosen.some((row) => row.idx === focusedEdgeIdx)) {
    const focused = rows.find((row) => row.idx === focusedEdgeIdx)
    if (focused) {
      chosen.pop()
      chosen.unshift(focused)
    }
  }

  return chosen.map((row) => row.idx)
}

export function shouldAutoFocusTask3({
  isTraining = false,
  autoFollow = true,
  anchorIdx = null,
  focusedEdgeIdx = null,
  selectedNodeId = null,
  manualHoldUntil = 0,
  now = 0,
  previousFocusKey = null,
}) {
  if (!isTraining || !autoFollow) return false
  if (anchorIdx == null) return false
  if (focusedEdgeIdx != null || selectedNodeId != null) return false
  if (now < manualHoldUntil) return false

  const focusKey = String(anchorIdx)
  return focusKey !== previousFocusKey
}

export function clampTask3Zoom(value) {
  return Math.max(TASK3_MIN_ZOOM, Math.min(TASK3_MAX_ZOOM, Number(value) || 0))
}

export function getTask3NodeRadius({
  degree = 1,
  isSelected = false,
  isCommonNeighbor = false,
}) {
  const base = Math.max(
    TASK3_NODE_SIZE_MIN,
    Math.min(TASK3_NODE_SIZE_CAP, Math.sqrt(Math.max(1, degree)) * 0.9 + 2.8),
  )

  if (isSelected) return Math.min(TASK3_NODE_SIZE_CAP + 2, base + 1.8)
  if (isCommonNeighbor) return Math.min(TASK3_NODE_SIZE_CAP + 1, base + 1.2)
  return base
}

export function shouldShowTask3NodeLabel({
  globalScale = 1,
  showBulkNodeLabels = false,
  isSelected = false,
  isCommonNeighbor = false,
}) {
  if (isSelected || isCommonNeighbor) return true
  if (showBulkNodeLabels && globalScale > 1.45) return true
  return globalScale > 2.05
}

export function shouldShowTask3EdgeLabel({
  isFocused = false,
  isPrimary = false,
  selectedNodeId = null,
  hoveredLink = null,
  scale = 1,
}) {
  if (isFocused) return true
  if (!isPrimary) return false
  return (selectedNodeId != null || hoveredLink != null) && scale > 0.95
}

function buildAdjacency(graphData) {
  const adjacency = new Map()
  for (const node of graphData?.nodes || []) adjacency.set(node.id, new Set())
  for (const link of graphData?.links || []) {
    const source = typeof link.source === 'object' ? link.source.id : link.source
    const target = typeof link.target === 'object' ? link.target.id : link.target
    if (source == null || target == null) continue
    if (!adjacency.has(source)) adjacency.set(source, new Set())
    if (!adjacency.has(target)) adjacency.set(target, new Set())
    adjacency.get(source).add(target)
    adjacency.get(target).add(source)
  }
  return adjacency
}

function shortestPathNodes(adjacency, source, target, maxDepth = 4) {
  if (source == null || target == null) return []
  if (source === target) return [source]
  const visited = new Set([source])
  const queue = [{ node: source, depth: 0, path: [source] }]
  while (queue.length) {
    const current = queue.shift()
    if (!current || current.depth >= maxDepth) continue
    for (const neighbor of adjacency.get(current.node) || []) {
      if (visited.has(neighbor)) continue
      const nextPath = [...current.path, neighbor]
      if (neighbor === target) return nextPath
      visited.add(neighbor)
      queue.push({ node: neighbor, depth: current.depth + 1, path: nextPath })
    }
  }
  return []
}

export function buildTask3FocusContext({
  graphData,
  testEdges = [],
  focusedEdgeIdx = null,
  selectedNodeId = null,
}) {
  const highlightedNodes = new Set()
  const endpointNodes = new Set()
  const mutualNeighbors = new Set()
  const pathNodes = new Set()
  const neighborhoodNodes = new Set()
  if (!graphData) {
    return {
      hasFocus: false,
      highlightedNodes,
      endpointNodes,
      mutualNeighbors,
      pathNodes,
      neighborhoodNodes,
    }
  }

  const adjacency = buildAdjacency(graphData)
  const focusedEdge = focusedEdgeIdx != null ? testEdges?.[focusedEdgeIdx] : null

  if (selectedNodeId != null) {
    neighborhoodNodes.add(selectedNodeId)
    highlightedNodes.add(selectedNodeId)
    for (const neighbor of adjacency.get(selectedNodeId) || []) {
      neighborhoodNodes.add(neighbor)
      highlightedNodes.add(neighbor)
    }
  }

  if (focusedEdge) {
    const { source, target } = focusedEdge
    endpointNodes.add(source)
    endpointNodes.add(target)
    highlightedNodes.add(source)
    highlightedNodes.add(target)
    neighborhoodNodes.add(source)
    neighborhoodNodes.add(target)

    const sourceNeighbors = adjacency.get(source) || new Set()
    const targetNeighbors = adjacency.get(target) || new Set()
    for (const nodeId of sourceNeighbors) neighborhoodNodes.add(nodeId)
    for (const nodeId of targetNeighbors) neighborhoodNodes.add(nodeId)
    for (const nodeId of sourceNeighbors) {
      if (targetNeighbors.has(nodeId)) {
        mutualNeighbors.add(nodeId)
        highlightedNodes.add(nodeId)
      }
    }
    for (const nodeId of shortestPathNodes(adjacency, source, target, 4)) {
      pathNodes.add(nodeId)
      highlightedNodes.add(nodeId)
    }
  }

  return {
    hasFocus: focusedEdgeIdx != null || selectedNodeId != null,
    highlightedNodes,
    endpointNodes,
    mutualNeighbors,
    pathNodes,
    neighborhoodNodes,
  }
}
