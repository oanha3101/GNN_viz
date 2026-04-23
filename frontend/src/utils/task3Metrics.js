// Pure helpers for Task 3 (Link Prediction) diagnostics. No React / DOM.
// Inputs are plain arrays of scores + ground truth labels (edges `exists` flag).

/**
 * pairScores — zip `scores[i]` with `testEdges[i].exists` and sort by score
 * descending. Returned array is stable and reusable by ROC / PR / histogram
 * builders so we only pay the sort cost once.
 */
export function pairScores(scores, testEdges) {
  if (!Array.isArray(scores) || !Array.isArray(testEdges)) return []
  const out = []
  const n = Math.min(scores.length, testEdges.length)
  for (let i = 0; i < n; i++) {
    out.push({
      idx: i,
      score: scores[i] ?? 0,
      y: testEdges[i]?.exists ? 1 : 0,
      source: testEdges[i]?.source ?? null,
      target: testEdges[i]?.target ?? null,
    })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

/**
 * buildROCPoints — returns { points: [{fpr,tpr}], auc }. When the inputs
 * degenerate (no positives / no negatives) returns an empty curve and
 * auc=0.5.
 */
export function buildROCPoints(paired) {
  if (!paired?.length) return { points: [{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }], auc: 0.5 }
  const totalPos = paired.filter((p) => p.y === 1).length
  const totalNeg = paired.length - totalPos
  if (totalPos === 0 || totalNeg === 0) {
    return { points: [{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }], auc: 0.5 }
  }
  let tp = 0
  let fp = 0
  const points = [{ fpr: 0, tpr: 0 }]
  for (const p of paired) {
    if (p.y === 1) tp += 1
    else fp += 1
    points.push({ fpr: fp / totalNeg, tpr: tp / totalPos })
  }
  // Trapezoidal AUC
  let auc = 0
  for (let i = 1; i < points.length; i++) {
    auc += (points[i].fpr - points[i - 1].fpr) * (points[i].tpr + points[i - 1].tpr) * 0.5
  }
  return { points, auc }
}

/**
 * buildPRPoints — returns { points: [{recall,precision}], ap }. Average
 * precision (AP) is computed as the trapezoidal area under the PR curve.
 */
export function buildPRPoints(paired) {
  if (!paired?.length) return { points: [], ap: 0 }
  const totalPos = paired.filter((p) => p.y === 1).length
  if (totalPos === 0) return { points: [], ap: 0 }
  let tp = 0
  let fp = 0
  const points = []
  for (const p of paired) {
    if (p.y === 1) tp += 1
    else fp += 1
    points.push({
      recall: tp / totalPos,
      precision: tp / (tp + fp),
    })
  }
  let ap = 0
  let prevRecall = 0
  let prevPrecision = points[0].precision
  for (const pt of points) {
    ap += (pt.recall - prevRecall) * (pt.precision + prevPrecision) * 0.5
    prevRecall = pt.recall
    prevPrecision = pt.precision
  }
  return { points, ap }
}

/**
 * topKHardEdges — hardest cases for the model right now.
 *   - top-K false positives: y=0 but high score
 *   - top-K false negatives: y=1 but low score
 */
export function topKHardEdges(paired, k = 5, threshold = 0.5) {
  if (!paired?.length) return { falsePositives: [], falseNegatives: [] }
  const falsePositives = paired
    .filter((p) => p.y === 0 && p.score >= threshold)
    .slice(0, k)
  const falseNegatives = paired
    .filter((p) => p.y === 1 && p.score < threshold)
    .sort((a, b) => a.score - b.score) // worst first
    .slice(0, k)
  return { falsePositives, falseNegatives }
}

/**
 * buildScoreHistogram — bucket positives & negatives into `bins` bins over
 * [0, 1]. Returns [{ label, lo, hi, positive, negative }] of length `bins`.
 */
export function buildScoreHistogram(paired, bins = 10) {
  const safe = Math.max(1, bins)
  const out = Array.from({ length: safe }, (_, i) => ({
    label: `${(i / safe).toFixed(1)}`,
    lo: i / safe,
    hi: (i + 1) / safe,
    positive: 0,
    negative: 0,
  }))
  for (const p of paired) {
    const b = Math.min(safe - 1, Math.floor((p.score ?? 0) * safe))
    if (p.y === 1) out[b].positive += 1
    else out[b].negative += 1
  }
  return out
}

/**
 * accuracyAtThreshold — fraction of predictions correct at a given cutoff.
 */
export function accuracyAtThreshold(paired, threshold = 0.5) {
  if (!paired?.length) return 0
  let correct = 0
  for (const p of paired) {
    const pred = p.score >= threshold ? 1 : 0
    if (pred === p.y) correct += 1
  }
  return correct / paired.length
}
