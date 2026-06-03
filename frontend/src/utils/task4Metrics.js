// Pure helpers to derive diagnostic Task 4 (Community Detection) metrics
// from snapshot history. All inputs are plain arrays / JSON; no DOM / React.

/**
 * buildBridgeRanking Ä‚Â¢Ă¢â€Â¬Ă¢â‚¬Â return the top-K bridge nodes by strength in a single
 * snapshot. `bridge_strength` is optional Ä‚Â¢Ă¢â€Â¬Ă¢â‚¬Â when absent we fall back to the
 * boolean `bridge_nodes` flag with score 1.
 *
 *  snap : epoch snapshot ({ bridge_nodes[], bridge_strength[], node_predictions[] })
 *  k    : number of bridges to return
 */
export function buildBridgeRanking(snap, k = 10) {
  if (!snap) return []
  const flags = snap.bridge_nodes || []
  const strengths = snap.bridge_strength || []
  const preds = snap.node_predictions_aligned ?? snap.node_predictions ?? []

  const items = []
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]
    const s = strengths[i] ?? (flag ? 1 : 0)
    if (!flag && !(s > 0)) continue
    items.push({
      id: i,
      strength: s,
      community: preds[i] ?? null,
    })
  }
  items.sort((a, b) => b.strength - a.strength)
  return items.slice(0, k)
}

/**
 * buildStabilityMatrix Ä‚Â¢Ă¢â€Â¬Ă¢â‚¬Â matrix of [community Ă„â€Ă¢â‚¬â€ epoch] representing the
 * proportion of nodes that kept the same community assignment from the
 * previous epoch. 1.0 = fully stable, 0 = every node moved.
 *
 * Returns { matrix, numCommunities, numEpochs, epochAverages }.
 * `matrix[c][e]` is stability at epoch e for community c.
 *
 *  snapshots : array of epoch snapshots
 *  numCommunities : optional override (inferred from max prediction otherwise)
 */
export function buildStabilityMatrix(snapshots = [], numCommunities) {
  if (!snapshots.length) {
    return { matrix: [], numCommunities: 0, numEpochs: 0, epochAverages: [] }
  }
  let C = numCommunities
  if (C == null) {
    let max = 0
    for (const s of snapshots) {
      const preds = s?.node_predictions_aligned ?? s?.node_predictions ?? []
      for (const p of preds) if (p > max) max = p
    }
    C = max + 1
  }
  C = Math.max(1, C)
  const E = snapshots.length
  const matrix = Array.from({ length: C }, () => new Array(E).fill(1))
  const epochAverages = new Array(E).fill(1)

  for (let e = 1; e < E; e++) {
    const prev = snapshots[e - 1]?.node_predictions_aligned ?? snapshots[e - 1]?.node_predictions ?? []
    const curr = snapshots[e]?.node_predictions_aligned ?? snapshots[e]?.node_predictions ?? []
    const stayed = new Array(C).fill(0)
    const total = new Array(C).fill(0)
    const n = Math.min(prev.length, curr.length)
    for (let i = 0; i < n; i++) {
      const pc = prev[i]
      if (pc == null || pc < 0 || pc >= C) continue
      total[pc] += 1
      if (prev[i] === curr[i]) stayed[pc] += 1
    }
    let sumStayed = 0
    let sumTotal = 0
    for (let c = 0; c < C; c++) {
      matrix[c][e] = total[c] > 0 ? stayed[c] / total[c] : 1
      sumStayed += stayed[c]
      sumTotal += total[c]
    }
    epochAverages[e] = sumTotal > 0 ? sumStayed / sumTotal : 1
  }

  return { matrix, numCommunities: C, numEpochs: E, epochAverages }
}

/**
 * buildClusterConfidenceHistogram Ä‚Â¢Ă¢â€Â¬Ă¢â‚¬Â bucket per-node `cluster_confidence`
 * into bins between 0 and 1.
 */
export function buildClusterConfidenceHistogram(snap, bins = 10) {
  const values = snap?.cluster_confidence || []
  const finite = values.filter((value) => Number.isFinite(value))
  const hasNegative = finite.some((value) => value < 0)
  const min = hasNegative ? -1 : 0
  const max = 1
  const out = Array.from({ length: bins }, (_, i) => ({
    range: [
      min + ((max - min) * i) / bins,
      min + ((max - min) * (i + 1)) / bins,
    ],
    count: 0,
  }))
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    const c = Math.max(min, Math.min(max - 1e-6, v))
    const idx = Math.floor(((c - min) / (max - min)) * bins)
    out[Math.max(0, Math.min(bins - 1, idx))].count += 1
  }
  return out
}

export function normalizeClusterConfidence(value) {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return (Math.max(-1, value) + 1) / 2
  return Math.max(0, Math.min(1, value))
}

/**
 * normalizeCommunityCenters Ä‚Â¢Ă¢â€Â¬Ă¢â‚¬Â scale a set of fixed cluster anchor positions
 * so the whole layout fits inside a container without over-zoom. Anchors are
 * given in a "reference" coordinate space (e.g. Ä‚â€Ă‚Â±220Ă„â€Ă¢â‚¬â€150 for a 600-unit
 * reference) and we produce proportional coordinates for the requested
 * container width / height.
 *
 *  anchors   : [{ x, y }] anchor points in reference space
 *  width     : container width  (px)
 *  height    : container height (px)
 *  reference : reference edge length (default 600)
 *
 * Returned anchors are centred on (0, 0) because ForceGraph2D's world
 * coordinate origin is at the canvas centre.
 */
export function normalizeCommunityCenters(anchors = [], width = 800, height = 600, reference = 600) {
  const scale = Math.min(width, height) / reference
  return anchors.map(({ x, y }) => ({ x: x * scale, y: y * scale }))
}

/**
 * computeAggregateStability Ä‚Â¢Ă¢â€Â¬Ă¢â‚¬Â helper that returns the mean of
 * `epochAverages` excluding epoch 0 (which is 1.0 by definition).
 */
export function computeAggregateStability(matrix) {
  if (!matrix?.epochAverages?.length || matrix.numEpochs < 2) return 1
  const avgs = matrix.epochAverages
  let sum = 0
  for (let e = 1; e < avgs.length; e++) sum += avgs[e]
  return sum / (avgs.length - 1)
}

function finiteAverage(values = [], fallback = 0) {
  const finite = values.filter((value) => Number.isFinite(value))
  if (!finite.length) return fallback
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

/**
 * buildTask4QualitySummary -- stable aggregate view for Task 4 panels.
 * New backend snapshots provide these aggregates directly; legacy replay
 * snapshots can still derive them from per-node and per-community arrays.
 */
export function buildTask4QualitySummary(snap) {
  const communitySizes = snap?.community_sizes || []
  const totalNodes = communitySizes.reduce((sum, size) => sum + (Number.isFinite(size) ? size : 0), 0)
  const bridgeFlags = snap?.bridge_nodes || []

  const modularity = snap?.modularity_q ?? 0
  const conductance = snap?.conductance ?? 0
  const silhouette = snap?.mean_silhouette ?? finiteAverage(snap?.silhouette_scores || [], 0)
  const confidence = snap?.mean_cluster_confidence ?? finiteAverage(snap?.cluster_confidence || [], 0)
  const bridgeRatio = snap?.bridge_ratio ?? (
    bridgeFlags.length ? bridgeFlags.filter(Boolean).length / bridgeFlags.length : 0
  )
  const largestCommunityRatio = snap?.largest_community_ratio ?? (
    totalNodes > 0 ? Math.max(...communitySizes, 0) / totalNodes : 0
  )
  const emptyCommunityCount = snap?.empty_community_count ?? communitySizes.filter((size) => size === 0).length

  const balanceScore = 1 - clamp01(largestCommunityRatio)
  const bridgeScore = 1 - clamp01(bridgeRatio)
  const conductanceScore = 1 - clamp01(conductance)
  const healthScore = clamp01(
    clamp01(modularity) * 0.28 +
    clamp01((silhouette + 1) / 2) * 0.22 +
    clamp01((confidence + 1) / 2) * 0.18 +
    conductanceScore * 0.14 +
    bridgeScore * 0.1 +
    balanceScore * 0.08
  )

  return {
    modularity,
    conductance,
    silhouette,
    confidence,
    bridgeRatio,
    largestCommunityRatio,
    emptyCommunityCount,
    healthScore,
  }
}

function pct(value, digits = 1) {
  if (!Number.isFinite(value)) return 'N/A'
  return `${(value * 100).toFixed(digits)}%`
}

function task4Status(summary, migrationPct = 0) {
  if (summary.bridgeRatio > 0.35) return 'boundary'
  if (summary.conductance > 0.38) return 'leakage'
  if (migrationPct > 0.15) return 'migration'
  if (summary.confidence < 0.2) return 'confidence'
  if (summary.modularity >= 0.42 && summary.conductance <= 0.25) return 'strong'
  return 'mixed'
}

export function buildTask4ReasoningPack(snap, snapshots = [], graphData = null, selectedModel = 'GCN') {
  const summary = buildTask4QualitySummary(snap)
  const transitions = snap?.community_transitions || {}
  const totalNodes = snap?.node_predictions?.length || snap?.community_sizes?.reduce((a, b) => a + b, 0) || 1
  const migratedCount = Object.values(transitions).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const migrationRatio = migratedCount / Math.max(1, totalNodes)
  const dominantIssue = task4Status(summary, migrationRatio)
  const healthStatus = summary.healthScore >= 0.72 ? 'tot' : summary.healthScore >= 0.52 ? 'canh_bao' : 'yeu'
  const modelKey = String(snap?.model_type || selectedModel || 'GCN').toUpperCase()
  const stabilityDrop = Number.isFinite(snap?.stability_drop) ? snap.stability_drop : 0
  const modelStability = {
    status: snap?.model_stability_status || (stabilityDrop > 0.12 ? 'unstable_drop' : 'stable'),
    label: stabilityDrop > 0.12 ? 'Vua tut on dinh' : snap?.community_stability >= 0.85 ? 'On dinh' : 'Can theo doi',
    detail: modelKey === 'GAT'
      ? 'GAT nen duoc doc cung attention o canh lien cong dong.'
      : modelKey === 'SAGE'
        ? 'GraphSAGE nen duoc doc cung do ben khi them nhieu lan can.'
        : 'GCN nen duoc doc cung do muot lan can va Dirichlet energy.',
  }

  const issueText = {
    strong: 'Cac cong dong tach tuong doi ro va it ro ri.',
    mixed: 'Cau truc cong dong doc duoc nhung ranh gioi chua that sac.',
    boundary: 'Nhieu node dang lam cau noi, nen ranh gioi cong dong bi mo.',
    leakage: 'Conductance cao cho thay nhieu canh dang ro sang cong dong khac.',
    migration: 'Nhieu node doi cong dong qua epoch, partition con dao dong.',
    confidence: 'Doc do chac cua gan cum; gia tri gan 0 hoac am la yeu.',
  }[dominantIssue]

  const communityCards = (snap?.per_community_metrics || []).map((metric, index) => {
    const size = metric?.size ?? snap?.community_sizes?.[index] ?? 0
    const bridgeCount = (snap?.bridge_nodes || []).filter((flag, nodeId) => {
      const preds = snap?.node_predictions_aligned ?? snap?.node_predictions ?? []
      return flag && preds[nodeId] === index
    }).length
    const conductance = metric?.conductance ?? 1
    const status = conductance > 0.45 || bridgeCount > Math.max(1, size * 0.35)
      ? 'Ro ri manh'
      : conductance > 0.28
        ? 'Bien vua'
        : 'Loi kha sach'
    return {
      id: index,
      size,
      conductance,
      bridgeCount,
      status,
      takeaway: `C${index}: ${status}, ${size} node, ${bridgeCount} node cau noi.`,
    }
  })

  return {
    summary,
    healthStatus,
    dominantIssue,
    takeaway: `${issueText} Q=${summary.modularity.toFixed(3)}, conductance=${summary.conductance.toFixed(3)}, bridge=${pct(summary.bridgeRatio)}.`,
    metricExplanations: {
      modularity: 'Cang cao cang tach cong dong tot.',
      conductance: 'Cang thap cang it canh ro ra ngoai.',
      bridgeRatio: 'Cang cao cang nhieu node nam o vung bien.',
      migration: 'Cang cao cang nhieu node doi cong dong qua epoch.',
      stability: 'Cang cao cang it node doi cong dong giua hai epoch.',
      confidence: 'Doc do chac cua gan cum; gia tri gan 0 hoac am la yeu.',
    },
    communityCards,
    bridgeNarrative: summary.bridgeRatio > 0.35
      ? `Bridge ratio ${pct(summary.bridgeRatio)} la nguyen nhan chinh lam cum nhin lech va ranh gioi mo.`
      : `Bridge ratio ${pct(summary.bridgeRatio)} chua phai van de lon nhat.`,
    modelStability,
    migrationRatio,
  }
}

export function buildTask4ReasoningHighlights(snap, snapshots = [], selectedModel = 'GCN') {
  const pack = buildTask4ReasoningPack(snap, snapshots, null, selectedModel)
  const summary = pack.summary || buildTask4QualitySummary(snap)
  const cards = (pack.communityCards || []).map((card) => {
    const bridgeDensity = Number.isFinite(card.bridgeDensity)
      ? card.bridgeDensity
      : (card.bridgeCount || 0) / Math.max(1, card.size || 1)
    const cleanliness = Number.isFinite(card.cleanliness)
      ? card.cleanliness
      : clamp01(1 - (card.conductance ?? 1))
    const severityScore = Number.isFinite(card.severityScore)
      ? card.severityScore
      : (card.conductance ?? 1) * 0.58 + bridgeDensity * 0.42
    return {
      ...card,
      bridgeDensity,
      cleanliness,
      severityScore,
    }
  })

  const worstCommunity = [...cards].sort((a, b) => b.severityScore - a.severityScore)[0] || null
  const bestCommunity = [...cards].sort((a, b) => b.cleanliness - a.cleanliness)[0] || null
  const topIssueCommunity = worstCommunity?.id ?? null

  const previousSnap = snapshots.length > 1
    ? (snapshots.find((entry) => entry?.epoch === snap?.epoch - 1) || snapshots[snapshots.length - 2] || null)
    : null
  const previousSummary = previousSnap ? buildTask4QualitySummary(previousSnap) : summary
  const bridgeDelta = summary.bridgeRatio - previousSummary.bridgeRatio
  const conductanceDelta = summary.conductance - previousSummary.conductance
  const modularityDelta = summary.modularity - previousSummary.modularity
  const migrationRatio = pack.migrationRatio ?? 0

  let epochChangeSummary = 'Epoch nay tuong doi on, chua co dau hieu thay doi lon.'
  if (bridgeDelta > 0.04) {
    epochChangeSummary = `Bridge tang ${pct(bridgeDelta)}, bien cong dong dang mo hon epoch truoc.`
  } else if (conductanceDelta > 0.04) {
    epochChangeSummary = `Conductance tang ${conductanceDelta.toFixed(3)}, tin hieu dang ro sang cong dong khac nhieu hon.`
  } else if (modularityDelta > 0.04) {
    epochChangeSummary = `Modularity tang ${modularityDelta.toFixed(3)}, phan tach cong dong dang sac hon.`
  } else if (migrationRatio > 0.12) {
    epochChangeSummary = `Migration dang o ${pct(migrationRatio)}, partition van con dao dong qua epoch.`
  }

  const reportHeadline = worstCommunity
    ? `C${worstCommunity.id} dang la cong dong goi van de lon nhat vi ${String(worstCommunity.status || '').toLowerCase()}.`
    : pack.takeaway

  return {
    ...pack,
    communityCards: cards,
    topIssueCommunity,
    bestCommunity,
    worstCommunity,
    epochChangeSummary,
    reportHeadline,
  }
}

export function buildCommunityAnchors(count = 1, width = 800, height = 600) {
  const n = Math.max(1, count)
  if (n === 1) return [{ x: 0, y: 0 }]
  const radius = Math.min(width, height) * 0.4
  const presets = {
    2: [
      { x: -0.86, y: 0.02 },
      { x: 0.86, y: -0.02 },
    ],
    3: [
      { x: -0.8, y: -0.34 },
      { x: 0.82, y: -0.24 },
      { x: -0.04, y: 0.82 },
    ],
    4: [
      { x: -0.84, y: -0.36 },
      { x: 0.8, y: -0.34 },
      { x: 0.72, y: 0.62 },
      { x: -0.82, y: 0.58 },
    ],
    5: [
      { x: -0.9, y: -0.18 },
      { x: -0.3, y: -0.78 },
      { x: 0.56, y: -0.66 },
      { x: 0.88, y: 0.04 },
      { x: -0.08, y: 0.84 },
    ],
    6: [
      { x: -0.92, y: -0.14 },
      { x: -0.46, y: -0.78 },
      { x: 0.34, y: -0.82 },
      { x: 0.9, y: -0.04 },
      { x: 0.52, y: 0.72 },
      { x: -0.42, y: 0.8 },
    ],
  }
  const template = presets[n]
  if (template) {
    return template.map(({ x, y }) => ({ x: x * radius, y: y * radius }))
  }
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + 0.28 + (i / n) * Math.PI * 2
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
}

export function buildCoreCommunityEnvelopes(nodes = [], preds = [], snap = {}, options = {}) {
  const byCommunity = new Map()
  const bridgeStrength = snap?.bridge_strength || []
  const bridgeFlags = snap?.bridge_nodes || []
  const maxBridgeStrength = options.maxBridgeStrength ?? 0.55
  const padding = options.padding ?? 28

  for (const node of nodes) {
    if (!Number.isFinite(node?.x) || !Number.isFinite(node?.y)) continue
    const cid = preds[node.id] ?? 0
    if (!byCommunity.has(cid)) byCommunity.set(cid, [])
    byCommunity.get(cid).push({
      x: node.x,
      y: node.y,
      bridge: Boolean(bridgeFlags[node.id]) || (bridgeStrength[node.id] ?? 0) > maxBridgeStrength,
    })
  }

  return [...byCommunity.entries()].map(([cid, points]) => {
    const centroid = points.reduce((acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length,
    }), { x: 0, y: 0 })
    const distances = points.map((point) => Math.hypot(point.x - centroid.x, point.y - centroid.y)).sort((a, b) => a - b)
    const cutoff = distances[Math.max(0, Math.floor(distances.length * 0.78) - 1)] || Infinity
    const core = points.filter((point) => !point.bridge && Math.hypot(point.x - centroid.x, point.y - centroid.y) <= cutoff * 1.18)
    const used = core.length >= 3 ? core : points
    if (used.length < 3) {
      const radius = Math.max(34, ...used.map((point) => Math.hypot(point.x - centroid.x, point.y - centroid.y) + padding))
      return { cid: Number(cid), type: 'circle', center: centroid, radius }
    }
    const hull = used.map((point) => [point.x, point.y])
    return { cid: Number(cid), type: 'hull', points: hull, padding }
  })
}

function endpointId(endpoint) {
  if (endpoint && typeof endpoint === 'object') return endpoint.id
  return endpoint
}

export function getTask4OverlayMode(modelName) {
  const key = String(modelName || '').toUpperCase().replace('-', '_')
  if (key === 'GAT') return 'attention'
  if (key === 'GCN') return 'smoothness'
  if (key === 'SAGE' || key === 'GRAPHSAGE' || key === 'GRAPH_SAGE') return 'migration'
  return 'none'
}

export function buildTask4MotionProfile({
  nodeCount = 0,
  linkCount = 0,
  migrationRate = 0,
  selectedCommunityId = null,
} = {}) {
  const dense = nodeCount > 180 || linkCount > 480
  const large = nodeCount > 700 || linkCount > 1800
  const activeMigration = clamp01(migrationRate)
  const hasFocus = selectedCommunityId != null

  return {
    chargeStrength: large ? -56 : dense ? -72 : -88,
    linkDistance: large ? 24 : dense ? 30 : 38,
    centerStrength: hasFocus ? 0.05 : 0.035,
    communityStrength: large ? 0.018 : dense ? 0.026 : 0.038 + activeMigration * 0.018,
    velocityDecay: large ? 0.82 : dense ? 0.76 : 0.68,
    alphaDecay: large ? 0.09 : dense ? 0.065 : 0.045,
    warmupTicks: large ? 18 : dense ? 28 : 42,
    cooldownTicks: large ? 80 : dense ? 140 : 220,
    hullStrokeWidth: large ? 4.5 : dense ? 5.5 : 7,
    showNodeGlow: !large,
    showMigrationTrails: !large && activeMigration > 0,
  }
}

export function buildTask4NodeProfile({ snap, prevSnap = null, nodeId, graphData }) {
  if (nodeId == null || !snap) return null
  const node = graphData?.nodes?.find((item) => item.id === nodeId)
  const preds = snap.node_predictions_aligned ?? snap.node_predictions ?? []
  const prevPreds = prevSnap?.node_predictions_aligned ?? prevSnap?.node_predictions ?? []
  const community = preds[nodeId]
  const previousCommunity = prevPreds[nodeId]

  const bridgeFlags = snap.bridge_nodes || []
  const bridgeStrengths = snap.bridge_strength || []
  const booleanBridge = bridgeFlags[nodeId] === true
  const legacyBridge = !booleanBridge && bridgeFlags.includes?.(nodeId)
  const isBridge = Boolean(booleanBridge || legacyBridge || (bridgeStrengths[nodeId] ?? 0) > 0)

  let sameCommunityNeighbors = 0
  let crossCommunityNeighbors = 0
  const links = graphData?.links || []
  for (const link of links) {
    const source = endpointId(link.source)
    const target = endpointId(link.target)
    let other = null
    if (source === nodeId) other = target
    else if (target === nodeId) other = source
    if (other == null) continue
    if (preds[other] === community) sameCommunityNeighbors += 1
    else crossCommunityNeighbors += 1
  }

  return {
    id: nodeId,
    degree: node?.degree ?? sameCommunityNeighbors + crossCommunityNeighbors,
    community,
    previousCommunity,
    migrated: previousCommunity != null && community != null && previousCommunity !== community,
    isBridge,
    bridgeStrength: bridgeStrengths[nodeId] ?? (isBridge ? 1 : 0),
    silhouette: snap.silhouette_scores?.[nodeId] ?? null,
    confidence: snap.cluster_confidence?.[nodeId] ?? null,
    localSmoothness: snap.local_smoothness?.[nodeId] ?? null,
    sameCommunityNeighbors,
    crossCommunityNeighbors,
  }
}

export function buildTask4DendrogramRows(snap, limit = 12) {
  const rows = snap?.linkage_matrix
  if (!Array.isArray(rows) || rows.length === 0) return []
  const parsed = rows
    .map((row, step) => {
      if (!Array.isArray(row) || row.length < 4) return null
      const [left, right, distance, size] = row
      return {
        step,
        left: Number(left),
        right: Number(right),
        distance: Number(distance),
        size: Number(size),
      }
    })
    .filter((row) => (
      row &&
      Number.isFinite(row.left) &&
      Number.isFinite(row.right) &&
      Number.isFinite(row.distance) &&
      Number.isFinite(row.size)
    ))
  if (!parsed.length) return []
  const maxDistance = Math.max(...parsed.map((row) => row.distance), 1e-9)
  return parsed
    .slice(-limit)
    .map((row) => ({
      ...row,
      normalizedDistance: row.distance / maxDistance,
    }))
}
