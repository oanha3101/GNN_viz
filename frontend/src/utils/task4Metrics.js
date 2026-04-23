// Pure helpers to derive diagnostic Task 4 (Community Detection) metrics
// from snapshot history. All inputs are plain arrays / JSON; no DOM / React.

/**
 * buildBridgeRanking — return the top-K bridge nodes by strength in a single
 * snapshot. `bridge_strength` is optional — when absent we fall back to the
 * boolean `bridge_nodes` flag with score 1.
 *
 *  snap : epoch snapshot ({ bridge_nodes[], bridge_strength[], node_predictions[] })
 *  k    : number of bridges to return
 */
export function buildBridgeRanking(snap, k = 10) {
  if (!snap) return []
  const flags = snap.bridge_nodes || []
  const strengths = snap.bridge_strength || []
  const preds = snap.node_predictions || []

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
 * buildStabilityMatrix — matrix of [community × epoch] representing the
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
      for (const p of s?.node_predictions || []) if (p > max) max = p
    }
    C = max + 1
  }
  C = Math.max(1, C)
  const E = snapshots.length
  const matrix = Array.from({ length: C }, () => new Array(E).fill(1))
  const epochAverages = new Array(E).fill(1)

  for (let e = 1; e < E; e++) {
    const prev = snapshots[e - 1]?.node_predictions || []
    const curr = snapshots[e]?.node_predictions || []
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
 * buildClusterConfidenceHistogram — bucket per-node `cluster_confidence`
 * into bins between 0 and 1.
 */
export function buildClusterConfidenceHistogram(snap, bins = 10) {
  const values = snap?.cluster_confidence || []
  const out = Array.from({ length: bins }, (_, i) => ({
    range: [i / bins, (i + 1) / bins],
    count: 0,
  }))
  for (const v of values) {
    if (v == null) continue
    const c = Math.max(0, Math.min(0.9999, v))
    out[Math.floor(c * bins)].count += 1
  }
  return out
}

/**
 * normalizeCommunityCenters — scale a set of fixed cluster anchor positions
 * so the whole layout fits inside a container without over-zoom. Anchors are
 * given in a "reference" coordinate space (e.g. ±220×150 for a 600-unit
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
 * computeAggregateStability — helper that returns the mean of
 * `epochAverages` excluding epoch 0 (which is 1.0 by definition).
 */
export function computeAggregateStability(matrix) {
  if (!matrix?.epochAverages?.length || matrix.numEpochs < 2) return 1
  const avgs = matrix.epochAverages
  let sum = 0
  for (let e = 1; e < avgs.length; e++) sum += avgs[e]
  return sum / (avgs.length - 1)
}
