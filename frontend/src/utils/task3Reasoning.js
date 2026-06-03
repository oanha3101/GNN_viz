import { formatTask3Template, translateTask3Label } from './task3I18n'

function buildAdjacency(graphData) {
  const adjacency = new Map()
  const nodes = graphData?.nodes || []
  for (const node of nodes) adjacency.set(node.id, new Set())
  for (const link of graphData?.links || []) {
    const source = typeof link.source === 'object' ? link.source.id : link.source
    const target = typeof link.target === 'object' ? link.target.id : link.target
    if (source == null || target == null || source === target) continue
    if (!adjacency.has(source)) adjacency.set(source, new Set())
    if (!adjacency.has(target)) adjacency.set(target, new Set())
    adjacency.get(source).add(target)
    adjacency.get(target).add(source)
  }
  return adjacency
}

function countNeighborLinks(neighbors, adjacency) {
  const arr = Array.from(neighbors)
  let links = 0
  for (let i = 0; i < arr.length; i += 1) {
    for (let j = i + 1; j < arr.length; j += 1) {
      if (adjacency.get(arr[i])?.has(arr[j])) links += 1
    }
  }
  return links
}

function shortestPathWithin(adjacency, source, target, maxDepth = 4) {
  if (source === target) return { distance: 0, nodes: [source] }
  const visited = new Set([source])
  const queue = [{ node: source, depth: 0, path: [source] }]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    if (current.depth >= maxDepth) continue
    for (const neighbor of adjacency.get(current.node) || []) {
      if (visited.has(neighbor)) continue
      const nextPath = [...current.path, neighbor]
      if (neighbor === target) return { distance: current.depth + 1, nodes: nextPath }
      visited.add(neighbor)
      queue.push({ node: neighbor, depth: current.depth + 1, path: nextPath })
    }
  }
  return { distance: null, nodes: [] }
}

function cosineFromDistance(distance) {
  const safe = Math.max(0, Number(distance) || 0)
  return 1 / (1 + safe)
}

function classifyConfidence(score) {
  if (score >= 0.85) return 'high'
  if (score >= 0.65) return 'medium'
  if (score >= 0.45) return 'boundary'
  return 'low'
}

function buildRootCauseTags({ edge, metrics, stability }) {
  const tags = []
  const exists = edge.exists ?? edge.y === 1
  if (Math.abs(stability.latestScore - 0.5) <= 0.1 || stability.uncertainShare >= 0.35) {
    tags.push('boundary_score')
  }
  if (metrics.hubAttraction) tags.push('hub_attraction')
  if (metrics.commonNeighbors <= 1 && metrics.neighborJaccard < 0.12) tags.push('low_topology_support')
  if (metrics.embeddingSimilarity >= 0.72 && metrics.commonNeighbors <= 1) {
    tags.push('embedding_over_topology')
  }
  if (metrics.bridgeLike) tags.push('bridge_like')
  if (stability.flipCount > 0 || stability.volatility >= 0.08) tags.push('unstable')
  if (!exists && stability.latestScore >= 0.8) tags.push('high_conf_false_positive')
  if (exists && stability.latestScore < 0.5) tags.push('false_negative')
  tags.push(metrics.sameTopicCluster ? 'same_cluster' : 'cross_cluster')
  return Array.from(new Set(tags))
}

function buildConfidenceStory({ edge, stability }) {
  if (stability.flipCount > 0 || stability.uncertainShare >= 0.45) return 'unstable_boundary'
  if (!edge.exists && stability.latestScore >= 0.82 && stability.maxScore >= 0.9 && stability.minScore < 0.5) {
    return 'early_overconfidence'
  }
  const lateStart = stability.scoreSeries.length >= 3
    && stability.scoreSeries.slice(0, Math.max(1, Math.floor(stability.scoreSeries.length / 3))).every((row) => row.score < 0.5)
    && stability.latestScore >= 0.65
  if (lateStart) return 'late_convergence'
  if (stability.latestScore >= 0.5) return 'stable_positive'
  return 'stable_negative'
}

function buildWarnings({ metrics, stability }, lang) {
  const warnings = []
  if (metrics.commonNeighbors <= 1 && metrics.neighborJaccard < 0.12 && stability.latestScore >= 0.65) {
    warnings.push(translateTask3Label(lang, 'warnings', 'topologyWeak'))
  }
  if (stability.flipCount > 0 || stability.volatility >= 0.08) {
    warnings.push(translateTask3Label(lang, 'warnings', 'unstable'))
  }
  if (Math.abs(stability.latestScore - 0.5) <= 0.1 || stability.uncertainShare >= 0.35) {
    warnings.push(translateTask3Label(lang, 'warnings', 'boundary'))
  }
  return warnings
}

function getSupportLevel(metrics) {
  if (metrics.commonNeighbors >= 2 && metrics.neighborJaccard >= 0.2) return 'strong'
  if (metrics.commonNeighbors >= 1 || (metrics.shortestPath != null && metrics.shortestPath <= 2)) return 'medium'
  return 'weak'
}

function getDominantFailureMode({ edge, metrics, stability, rootCauseTags }) {
  const exists = edge.exists ?? edge.y === 1
  if (exists && stability.latestScore < 0.5) return 'false_negative'
  if (rootCauseTags.includes('unstable')) return 'unstable'
  if (rootCauseTags.includes('boundary_score')) return 'boundary'
  if (rootCauseTags.includes('hub_attraction')) return 'hub'
  if (rootCauseTags.includes('embedding_over_topology')) return 'embedding'
  if (rootCauseTags.includes('low_topology_support') || metrics.commonNeighbors <= 1) return 'weak_topology'
  return 'mixed'
}

function getSeverityScore({ edge, metrics, stability, rootCauseTags, dominantFailureMode }) {
  const exists = edge.exists ?? edge.y === 1
  const wrongAtThreshold = exists ? stability.latestScore < 0.5 : stability.latestScore >= 0.5
  const distance = Math.abs(stability.latestScore - 0.5)
  const modeBoost = {
    unstable: 2.2,
    false_negative: 2,
    weak_topology: 1.6,
    embedding: 1.4,
    hub: 1.2,
    boundary: 1,
    mixed: 0.6,
  }[dominantFailureMode] ?? 0.6

  return Number((
    (wrongAtThreshold ? 3 : 0)
    + modeBoost
    + Math.min(2, stability.flipCount * 0.65)
    + Math.min(1.5, stability.uncertainShare * 1.8)
    + Math.min(1.4, stability.volatility * 8)
    + Math.min(1.2, rootCauseTags.length * 0.16)
    + (metrics.commonNeighbors <= 1 ? 0.7 : 0)
    + (wrongAtThreshold ? distance : 0)
  ).toFixed(2))
}

function buildEvidenceBullets({ metrics, stability, supportLevel, lang }) {
  const embeddingMode = metrics.embeddingSimilarity >= 0.72 && metrics.commonNeighbors <= 1
    ? formatTask3Template(lang, 'narratives', 'embeddingOverTopology')
    : formatTask3Template(lang, 'narratives', 'embeddingAligned')

  return [
    {
      key: 'topology',
      label: translateTask3Label(lang, 'evidenceLabels', 'topology'),
      value: formatTask3Template(lang, 'narratives', 'topologyBullet', {
        mutual: metrics.commonNeighbors,
        jaccard: metrics.neighborJaccard.toFixed(2),
        path: metrics.shortestPath ?? '>4',
        support: translateTask3Label(lang, 'supportLevels', supportLevel),
      }),
    },
    {
      key: 'embedding',
      label: translateTask3Label(lang, 'evidenceLabels', 'embedding'),
      value: formatTask3Template(lang, 'narratives', 'embeddingBullet', {
        sim: metrics.embeddingSimilarity.toFixed(2),
        mode: embeddingMode,
      }),
    },
    {
      key: 'stability',
      label: translateTask3Label(lang, 'evidenceLabels', 'stability'),
      value: formatTask3Template(lang, 'narratives', 'stabilityBullet', {
        score: stability.latestScore.toFixed(3),
        flips: stability.flipCount,
        uncertain: Math.round(stability.uncertainShare * 100),
      }),
    },
  ]
}

function getTakeawayKey({ dominantFailureMode, rootCauseTags }) {
  if (dominantFailureMode === 'false_negative') return 'takeawayFalseNegative'
  if (dominantFailureMode === 'unstable') return 'takeawayUnstable'
  if (dominantFailureMode === 'boundary') return 'takeawayBoundary'
  if (dominantFailureMode === 'hub') return 'takeawayHub'
  if (dominantFailureMode === 'embedding') return 'takeawayEmbedding'
  if (dominantFailureMode === 'weak_topology' || rootCauseTags.includes('low_topology_support')) return 'takeawayWeakTopology'
  return 'takeawayStable'
}

function buildNarrative(edge, metrics, stability, lang) {
  const intro = edge.exists
    ? formatTask3Template(lang, 'narratives', 'heldOutReal')
    : formatTask3Template(lang, 'narratives', 'missingOrFuture')

  const parts = []
  if (metrics.commonNeighbors >= 2) {
    parts.push(formatTask3Template(lang, 'narratives', 'sharesMutual', { count: metrics.commonNeighbors }))
  } else if (metrics.shortestPath && metrics.shortestPath <= 3) {
    parts.push(formatTask3Template(lang, 'narratives', 'shortPath', { path: metrics.shortestPath }))
  }

  parts.push(
    metrics.sameTopicCluster
      ? formatTask3Template(lang, 'narratives', 'sameCluster')
      : formatTask3Template(lang, 'narratives', 'crossCluster'),
  )

  if (metrics.embeddingSimilarity >= 0.7) {
    parts.push(
      formatTask3Template(lang, 'narratives', 'highEmbedding', {
        value: metrics.embeddingSimilarity.toFixed(2),
      }),
    )
  } else if (metrics.bridgeLike) {
    parts.push(formatTask3Template(lang, 'narratives', 'bridgeLike'))
  } else if (metrics.hubAttraction) {
    parts.push(formatTask3Template(lang, 'narratives', 'hubAttraction'))
  }

  if (metrics.commonNeighbors <= 1) {
    parts.push(
      formatTask3Template(lang, 'narratives', 'topologyWeak', {
        mutual: metrics.commonNeighbors,
        jaccard: metrics.neighborJaccard.toFixed(2),
        path: metrics.shortestPath ?? '>4',
      }),
    )
  }

  const stabilityText = stability.flipCount > 0
    ? formatTask3Template(lang, 'narratives', 'unstable', { count: stability.flipCount })
    : stability.uncertainShare > 0.35
      ? formatTask3Template(lang, 'narratives', 'boundary', {
        share: Math.round(stability.uncertainShare * 100),
      })
      : formatTask3Template(lang, 'narratives', 'stable')

  const storyText = formatTask3Template(lang, 'narratives', 'confidence', {
    story: translateTask3Label(lang, 'confidenceStory', stability.confidenceStory),
  })

  return `${intro} ${parts.join(', ')}. ${stabilityText} ${storyText}`
    .replace(/\s+/g, ' ')
    .trim()
}

function buildVisualProof({ edge, metrics }, lang) {
  const lines = []
  if (metrics.commonNeighbors > 0) {
    lines.push(
      formatTask3Template(lang, 'narratives', 'visualProofMutual', {
        source: edge.source,
        target: edge.target,
        count: metrics.commonNeighbors,
      }),
    )
  }
  if (metrics.shortestPath && metrics.shortestPath > 1) {
    lines.push(
      formatTask3Template(lang, 'narratives', 'visualProofPath', {
        path: metrics.shortestPath,
      }),
    )
  }
  if (metrics.commonNeighbors === 0 && (!metrics.shortestPath || metrics.shortestPath > 3)) {
    lines.push(formatTask3Template(lang, 'narratives', 'visualProofIsolated'))
  }
  return lines
}

export function buildEdgeReasoning(
  graphData,
  edge,
  snapshots = [],
  groundTruth = [],
  snapshot = null,
  lang = 'en',
) {
  if (!graphData || !edge) return null
  const structureFeature = snapshot?.edge_structure_features?.find?.((row) => row.idx === edge.idx) || null
  const adjacency = buildAdjacency(graphData)
  const sourceNeighbors = adjacency.get(edge.source) || new Set()
  const targetNeighbors = adjacency.get(edge.target) || new Set()
  const commonNeighbors = Array.from(sourceNeighbors).filter((node) => targetNeighbors.has(node))
  const unionCount = new Set([...sourceNeighbors, ...targetNeighbors]).size || 1
  const degreeSource = structureFeature?.degree_source ?? sourceNeighbors.size
  const degreeTarget = structureFeature?.degree_target ?? targetNeighbors.size
  const shortestPathResult = structureFeature?.shortest_path
    ? { distance: structureFeature.shortest_path, nodes: [] }
    : shortestPathWithin(adjacency, edge.source, edge.target, 4)
  const shortestPath = shortestPathResult.distance
  const structuralEquivalence = structureFeature?.structural_equivalence
    ?? (commonNeighbors.length / Math.max(1, Math.sqrt(degreeSource * degreeTarget)))
  const neighborJaccard = structureFeature?.neighbor_jaccard ?? (commonNeighbors.length / unionCount)
  const localClusteringSource = structureFeature?.local_clustering_source ?? (degreeSource > 1
    ? (2 * countNeighborLinks(sourceNeighbors, adjacency)) / (degreeSource * (degreeSource - 1))
    : 0)
  const localClusteringTarget = structureFeature?.local_clustering_target ?? (degreeTarget > 1
    ? (2 * countNeighborLinks(targetNeighbors, adjacency)) / (degreeTarget * (degreeTarget - 1))
    : 0)

  const scoreSeries = snapshots
    .map((row, epoch) => ({
      epoch,
      score: Number(row?.edge_scores?.[edge.idx]),
    }))
    .filter((row) => Number.isFinite(row.score))
  const latestScore = scoreSeries.at(-1)?.score ?? Number(edge.score ?? 0)
  const embeddingDistance = Number(structureFeature?.embedding_distance ?? edge.embeddingDistance ?? 0)
  const embeddingSimilarity = structureFeature?.embedding_similarity
    ?? edge.embeddingSimilarity
    ?? cosineFromDistance(embeddingDistance)
  const sameTopicCluster = structureFeature?.same_ground_truth_label ?? (
    groundTruth?.[edge.source] !== undefined
    && groundTruth?.[edge.source] === groundTruth?.[edge.target]
  )
  const bridgeLike = (shortestPath == null || shortestPath >= 3) && commonNeighbors.length <= 1 && latestScore >= 0.65
  const hubAttraction = Math.max(degreeSource, degreeTarget) >= 12 && commonNeighbors.length <= 1 && latestScore >= 0.6
  const communityCrossing = !sameTopicCluster && latestScore >= 0.65

  let flipCount = 0
  const crossingEpochs = []
  for (let i = 1; i < scoreSeries.length; i += 1) {
    const prevPositive = scoreSeries[i - 1].score >= 0.5
    const currPositive = scoreSeries[i].score >= 0.5
    if (prevPositive !== currPositive) {
      flipCount += 1
      crossingEpochs.push(scoreSeries[i].epoch)
    }
  }

  const uncertainShare = scoreSeries.length
    ? scoreSeries.filter((row) => row.score >= 0.4 && row.score <= 0.6).length / scoreSeries.length
    : 0
  const mean = scoreSeries.length
    ? scoreSeries.reduce((sum, row) => sum + row.score, 0) / scoreSeries.length
    : latestScore
  const variance = scoreSeries.length
    ? scoreSeries.reduce((sum, row) => sum + (row.score - mean) ** 2, 0) / scoreSeries.length
    : 0
  const volatility = Math.sqrt(variance)

  const metrics = {
    degreeSource,
    degreeTarget,
    commonNeighbors: commonNeighbors.length,
    commonNeighborIds: commonNeighbors.slice(0, 8),
    sourceNeighborIds: Array.from(sourceNeighbors).slice(0, 10),
    targetNeighborIds: Array.from(targetNeighbors).slice(0, 10),
    neighborJaccard,
    shortestPath,
    shortestPathNodes: shortestPathResult.nodes,
    embeddingDistance,
    embeddingSimilarity,
    structuralEquivalence,
    localClusteringSource,
    localClusteringTarget,
    sameTopicCluster,
    bridgeLike,
    hubAttraction,
    communityCrossing,
    confidenceBand: classifyConfidence(latestScore),
  }

  const stability = {
    scoreSeries,
    latestScore,
    minScore: scoreSeries.length ? Math.min(...scoreSeries.map((row) => row.score)) : latestScore,
    maxScore: scoreSeries.length ? Math.max(...scoreSeries.map((row) => row.score)) : latestScore,
    flipCount,
    uncertainShare,
    volatility,
    crossingEpochs,
  }
  stability.confidenceStory = buildConfidenceStory({ edge, stability })

  const rootCauseTags = buildRootCauseTags({ edge, metrics, stability })
  const warnings = buildWarnings({ metrics, stability }, lang)
  const supportLevel = getSupportLevel(metrics)
  const dominantFailureMode = getDominantFailureMode({ edge, metrics, stability, rootCauseTags })
  const severityScore = getSeverityScore({ edge, metrics, stability, rootCauseTags, dominantFailureMode })
  const takeaway = formatTask3Template(
    lang,
    'narratives',
    getTakeawayKey({ dominantFailureMode, rootCauseTags }),
  )
  const evidenceBullets = buildEvidenceBullets({ metrics, stability, supportLevel, lang })
  const visualProof = buildVisualProof({ edge, metrics }, lang)

  return {
    ...edge,
    metrics,
    stability,
    rootCauseTags,
    rootCauseTagLabels: rootCauseTags.map((tag) => translateTask3Label(lang, 'rootCauseTags', tag)),
    warnings,
    supportLevel,
    supportLevelLabel: translateTask3Label(lang, 'supportLevels', supportLevel),
    dominantFailureMode,
    dominantFailureModeLabel: translateTask3Label(lang, 'dominantFailureModes', dominantFailureMode),
    severityScore,
    takeaway,
    evidenceBullets,
    confidenceStory: stability.confidenceStory,
    confidenceStoryLabel: translateTask3Label(lang, 'confidenceStory', stability.confidenceStory),
    visualProof,
    narrative: buildNarrative(edge, metrics, stability, lang),
    reportEvidence: [
      takeaway,
      ...evidenceBullets.map((bullet) => `${bullet.label}: ${bullet.value}`),
      ...visualProof.slice(0, 2),
    ],
  }
}

function sortSeverity(a, b) {
  return (b.severityScore ?? 0) - (a.severityScore ?? 0)
}

function buildDominantSummary(enriched, lang) {
  const counts = new Map()
  for (const edge of enriched) {
    const key = edge.dominantFailureMode || 'mixed'
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const modes = Array.from(counts.entries())
    .map(([key, count]) => ({
      key,
      count,
      label: translateTask3Label(lang, 'dominantFailureModes', key),
      recommendation: translateTask3Label(lang, 'recommendations', key),
    }))
    .sort((a, b) => b.count - a.count)

  const dominant = modes[0] || {
    key: 'mixed',
    count: 0,
    label: translateTask3Label(lang, 'dominantFailureModes', 'mixed'),
    recommendation: translateTask3Label(lang, 'recommendations', 'mixed'),
  }

  return {
    dominant,
    topModes: modes.slice(0, 3),
    recommendation: dominant.recommendation,
  }
}

export function buildTask3ReasoningPack({
  paired = [],
  graphData,
  snapshots = [],
  groundTruth = [],
  snapshot = null,
  lang = 'en',
}) {
  const enriched = paired
    .map((edge) => buildEdgeReasoning(graphData, edge, snapshots, groundTruth, snapshot, lang))
    .filter(Boolean)

  const ambiguous = [...enriched]
    .filter((edge) => Math.abs(edge.score - 0.5) <= 0.12 || edge.stability.uncertainShare > 0.3)
    .sort((a, b) => Math.abs(a.score - 0.5) - Math.abs(b.score - 0.5))
    .slice(0, 8)
  const bridgeEdges = enriched.filter((edge) => edge.metrics.bridgeLike).sort(sortSeverity).slice(0, 8)
  const hubDriven = enriched.filter((edge) => edge.metrics.hubAttraction).sort(sortSeverity).slice(0, 8)
  const unstable = [...enriched]
    .filter((edge) => edge.stability.flipCount > 0 || edge.stability.volatility >= 0.06)
    .sort((a, b) => b.stability.flipCount - a.stability.flipCount || b.stability.volatility - a.stability.volatility)
    .slice(0, 8)
  const priorityEdges = [...enriched].sort(sortSeverity).slice(0, 8)
  const summary = buildDominantSummary(enriched, lang)

  return { enriched, ambiguous, bridgeEdges, hubDriven, unstable, priorityEdges, summary }
}
