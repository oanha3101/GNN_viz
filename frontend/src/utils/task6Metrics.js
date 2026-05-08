// Pure helpers for Task 6 (Graph Generation) metric tabs. No React / DOM.
// Consumed by Task6MetricsPanel — Comparison / Invalidity / Signatures.

/**
 * buildHistogram — bins an array of numeric samples into `numBins` equal-width
 * buckets over `[min, max]`. Returns `[{ binLow, binHigh, count }]` of length
 * `numBins`. Values at or above `max` fall into the last bin. NaN/non-finite
 * samples are dropped.
 */
export function buildHistogram(samples, numBins, min = 0, max = 1) {
  const out = []
  const bins = Math.max(1, numBins | 0)
  const width = (max - min) / bins
  for (let i = 0; i < bins; i++) {
    out.push({ binLow: min + i * width, binHigh: min + (i + 1) * width, count: 0 })
  }
  if (!Array.isArray(samples) || width <= 0) return out
  for (const v of samples) {
    if (!Number.isFinite(v)) continue
    let idx = Math.floor((v - min) / width)
    if (idx < 0) idx = 0
    if (idx >= bins) idx = bins - 1
    out[idx].count += 1
  }
  return out
}

/**
 * computeGraphStats — extracts `{ density, avgDegree, clustering }` arrays from
 * a list of graphs (either source snapshot-style or generated_graphs). Uses
 * precomputed fields when present (`density`, `avg_degree`), and falls back
 * to recomputing from `{nodes, links}` otherwise. `clustering` is a coarse
 * local-clustering average — good enough for a distribution plot, cheap to
 * compute in the browser.
 */
export function computeGraphStats(graphs) {
  const density = []
  const avgDegree = []
  const clustering = []
  if (!Array.isArray(graphs)) return { density, avgDegree, clustering }
  for (const g of graphs) {
    if (!g) continue
    const nodes = Array.isArray(g.nodes) ? g.nodes : []
    const links = Array.isArray(g.links) ? g.links : []
    const n = nodes.length
    const m = links.length
    const maxEdges = Math.max(1, (n * (n - 1)) / 2)
    const d = Number.isFinite(g.density) ? g.density : m / maxEdges
    const avg = Number.isFinite(g.avg_degree) ? g.avg_degree : (m * 2) / Math.max(1, n)
    density.push(Math.max(0, Math.min(1, d)))
    avgDegree.push(avg)
    clustering.push(localClustering(nodes, links))
  }
  return { density, avgDegree, clustering }
}

function localClustering(nodes, links) {
  const n = nodes.length
  if (n < 3 || !links.length) return 0
  const adj = Array.from({ length: n }, () => new Set())
  for (const l of links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source
    const t = typeof l.target === 'object' ? l.target.id : l.target
    if (!Number.isInteger(s) || !Number.isInteger(t)) continue
    if (s < 0 || t < 0 || s >= n || t >= n || s === t) continue
    adj[s].add(t)
    adj[t].add(s)
  }
  let total = 0
  let counted = 0
  for (let i = 0; i < n; i++) {
    const neigh = Array.from(adj[i])
    const k = neigh.length
    if (k < 2) continue
    let triangles = 0
    for (let a = 0; a < neigh.length; a++) {
      for (let b = a + 1; b < neigh.length; b++) {
        if (adj[neigh[a]].has(neigh[b])) triangles += 1
      }
    }
    total += (2 * triangles) / (k * (k - 1))
    counted += 1
  }
  return counted === 0 ? 0 : total / counted
}

/**
 * buildComparisonHistograms — returns `{ density, avgDegree, clustering }`
 * where each entry is `{ source: [bin], generated: [bin] }` so the Comparison
 * tab can render 3 stacked charts with 2 series each.
 */
export function buildComparisonHistograms(sourceGraphs, generatedGraphs, numBins = 10) {
  const src = computeGraphStats(sourceGraphs)
  const gen = computeGraphStats(generatedGraphs)
  const maxDeg = Math.max(1, ...src.avgDegree, ...gen.avgDegree)
  return {
    density: {
      source: buildHistogram(src.density, numBins, 0, 1),
      generated: buildHistogram(gen.density, numBins, 0, 1),
    },
    avgDegree: {
      source: buildHistogram(src.avgDegree, numBins, 0, maxDeg),
      generated: buildHistogram(gen.avgDegree, numBins, 0, maxDeg),
    },
    clustering: {
      source: buildHistogram(src.clustering, numBins, 0, 1),
      generated: buildHistogram(gen.clustering, numBins, 0, 1),
    },
  }
}

/**
 * Normalize BE invalidity reason strings (e.g. "3 isolated node(s)") into
 * stable keywords matching the mock format ("isolated", "disconnected", "too_sparse").
 */
function normalizeReason(raw) {
  if (!raw) return 'unknown'
  const s = String(raw).toLowerCase()
  if (s.includes('isolat')) return 'isolated'
  if (s.includes('disconnect') || s.includes('component')) return 'disconnected'
  if (s.includes('sparse') || s.includes('density')) return 'too_sparse'
  return s
}

/**
 * countInvalidityReasons — aggregates `{ reason, count }` rows for all graphs
 * where `valid === false`. Graphs without a reason land under `"unknown"`.
 * Sorted descending by count so the Invalidity tab table reads top-first.
 */
export function countInvalidityReasons(graphs) {
  const tally = new Map()
  if (!Array.isArray(graphs)) return []
  for (const g of graphs) {
    if (!g || g.valid !== false) continue
    const reason = normalizeReason(g.invalidity_reason)
    tally.set(reason, (tally.get(reason) || 0) + 1)
  }
  const out = []
  for (const [reason, count] of tally) out.push({ reason, count })
  out.sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
  return out
}

/**
 * groupBySignature — buckets graphs by `.signature`. Returns sorted array of
 * `{ signature, count, matchesSource, ids }` where `matchesSource` is true if
 * ANY member has `matches_source === true`. Singleton signatures included so
 * the panel can show them greyed-out; sort puts duplicates first.
 */
export function groupBySignature(graphs) {
  const map = new Map()
  if (!Array.isArray(graphs)) return []
  for (const g of graphs) {
    if (!g || !g.signature) continue
    const sig = g.signature
    if (!map.has(sig)) map.set(sig, { signature: sig, count: 0, matchesSource: false, ids: [] })
    const entry = map.get(sig)
    entry.count += 1
    if (g.matches_source === true) entry.matchesSource = true
    entry.ids.push(g.id)
  }
  const out = Array.from(map.values())
  out.sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature))
  return out
}

/**
 * filterGraphsBy — small helper the TaskTopology6 grid uses to apply the
 * filter chips (All / Valid / Invalid / Novel). Kept pure so it can be tested.
 * "Novel" = `matches_source === false` (non-memorized). Unknown falls back to
 * treating matches_source as false.
 */
export function filterGraphsBy(graphs, mode) {
  if (!Array.isArray(graphs)) return []
  switch (mode) {
    case 'valid':
      return graphs.filter((g) => g && g.valid === true)
    case 'invalid':
      return graphs.filter((g) => g && g.valid === false)
    case 'novel':
      return graphs.filter((g) => g && g.matches_source !== true)
    default:
      return graphs.slice()
  }
}
