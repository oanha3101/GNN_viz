// Pure helpers for Task 5 (Graph Embedding) diagnostics. No React / DOM.
// Inputs are plain arrays produced by the backend (or mock) per snapshot.

/**
 * topKOutliers — returns the top-K nodes by outlier score (desc). Entries
 * whose score is NaN / undefined are skipped. Result items are `{ id, score }`.
 */
export function topKOutliers(scores, k = 10) {
  if (!Array.isArray(scores) || !scores.length) return []
  const rows = []
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i]
    // Handle both plain number[] (mock) and [{node_id, avg_distance_to_neighbors, is_outlier}] (real backend)
    const score = typeof s === 'number' ? s
      : (s && typeof s === 'object') ? (s.score ?? s.avg_distance_to_neighbors ?? s.is_outlier ?? null)
      : null
    if (score == null || !Number.isFinite(score)) continue
    const nodeId = (s && typeof s === 'object' && s.node_id != null) ? s.node_id : i
    const isOutlier = (s && typeof s === 'object' && typeof s.is_outlier === 'boolean')
      ? s.is_outlier
      : undefined
    const row = { id: nodeId, score }
    if (isOutlier !== undefined) row.isOutlier = isOutlier
    rows.push(row)
  }
  rows.sort((a, b) => b.score - a.score)
  const safeK = Math.max(0, Math.min(rows.length, k))
  return rows.slice(0, safeK)
}

/**
 * buildNormHistogram — bucket `norms` into `bins` equal-width buckets over
 * [min, max]. When all norms are equal we centre a single fat bucket around
 * the value. Returns [{ lo, hi, count, label }].
 */
export function buildNormHistogram(norms, bins = 12) {
  if (!Array.isArray(norms) || !norms.length) return []
  const safe = Math.max(1, bins | 0)
  let min = Infinity
  let max = -Infinity
  for (const n of norms) {
    if (typeof n !== 'number' || !Number.isFinite(n)) continue
    if (n < min) min = n
    if (n > max) max = n
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (max === min) {
    // Degenerate: widen range a touch so we return a visible bucket.
    max = min + 1
  }
  const width = (max - min) / safe
  const out = Array.from({ length: safe }, (_, i) => ({
    lo: min + i * width,
    hi: min + (i + 1) * width,
    count: 0,
    label: (min + i * width).toFixed(2),
  }))
  for (const n of norms) {
    if (typeof n !== 'number' || !Number.isFinite(n)) continue
    const rel = (n - min) / (max - min)
    const b = Math.min(safe - 1, Math.max(0, Math.floor(rel * safe)))
    out[b].count += 1
  }
  return out
}

/**
 * computeIsotropy — crude proxy for embedding isotropy in [0, 1]. When the
 * embedding covariance is spherical (equal variance in every direction), we
 * return ~1. When embeddings collapse to a single point / line we return 0.
 *
 * Implemented as: 1 - coefficient-of-variation of per-dim variance.
 */
export function computeIsotropy(embeddings) {
  if (!Array.isArray(embeddings) || !embeddings.length) return 0
  const first = embeddings[0]
  if (!Array.isArray(first) || !first.length) return 0
  const D = first.length
  const N = embeddings.length
  const means = new Array(D).fill(0)
  for (const v of embeddings) {
    for (let d = 0; d < D; d++) means[d] += (v[d] ?? 0)
  }
  for (let d = 0; d < D; d++) means[d] /= N
  const variances = new Array(D).fill(0)
  for (const v of embeddings) {
    for (let d = 0; d < D; d++) {
      const diff = (v[d] ?? 0) - means[d]
      variances[d] += diff * diff
    }
  }
  for (let d = 0; d < D; d++) variances[d] /= N
  const mean = variances.reduce((s, x) => s + x, 0) / D
  if (mean === 0) return 0
  let sq = 0
  for (const v of variances) {
    const dv = v - mean
    sq += dv * dv
  }
  const std = Math.sqrt(sq / D)
  const cov = std / mean // coefficient of variation
  return Math.max(0, Math.min(1, 1 - cov))
}

/**
 * buildKnnScatter — zip node `degrees` and `knn` preservation scores into
 * plotting points. Nodes missing either signal are skipped.
 */
export function buildKnnScatter(degrees, knn) {
  if (!Array.isArray(degrees)) return []
  // knn can be number[] (mock) or Dict<string, number> (real backend)
  const knnIsArray = Array.isArray(knn)
  const knnIsDict = knn && typeof knn === 'object' && !knnIsArray
  if (!knnIsArray && !knnIsDict) return []
  const n = degrees.length
  const out = []
  for (let i = 0; i < n; i++) {
    const d = degrees[i]
    if (typeof d !== 'number' || !Number.isFinite(d)) continue
    const k = knnIsArray ? knn[i] : (knn[String(i)] ?? knn[i] ?? null)
    if (k == null || !Number.isFinite(k)) continue
    out.push({ id: i, degree: d, knn: k })
  }
  return out
}
