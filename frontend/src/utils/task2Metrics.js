// Pure helpers to derive diagnostic Task 2 (Graph Classification) metrics
// from a single snapshot. All inputs are plain arrays; functions return plain
// data that the viz components render. No DOM / React here.

/**
 * buildConfusionMatrix
 *  predictions : number[]  length G (predicted class index)
 *  groundTruth : number[]  length G (true class index)
 *  numClasses  : number    optional — inferred if omitted
 *
 * Returns { matrix, precision, recall, f1, support, accuracy, classes }.
 *   - matrix[pred][actual]   so rows=prediction, cols=ground truth
 *   - per-class precision / recall / f1 indexed by class id
 */
export function buildConfusionMatrix(predictions = [], groundTruth = [], numClasses) {
  const n = Math.min(predictions.length, groundTruth.length)
  let C = numClasses
  if (C == null) {
    let max = 0
    for (let i = 0; i < n; i++) {
      if (predictions[i] > max) max = predictions[i]
      if (groundTruth[i] > max) max = groundTruth[i]
    }
    C = max + 1
  }
  C = Math.max(1, C)

  const matrix = Array.from({ length: C }, () => new Array(C).fill(0))
  for (let i = 0; i < n; i++) {
    const p = predictions[i]
    const t = groundTruth[i]
    if (p == null || t == null) continue
    if (p < 0 || p >= C || t < 0 || t >= C) continue
    matrix[p][t] += 1
  }

  const precision = new Array(C).fill(0)
  const recall = new Array(C).fill(0)
  const f1 = new Array(C).fill(0)
  const support = new Array(C).fill(0)

  let correct = 0
  for (let c = 0; c < C; c++) {
    let predSum = 0
    let actualSum = 0
    for (let k = 0; k < C; k++) {
      predSum += matrix[c][k]
      actualSum += matrix[k][c]
    }
    const tp = matrix[c][c]
    correct += tp
    precision[c] = predSum > 0 ? tp / predSum : 0
    recall[c] = actualSum > 0 ? tp / actualSum : 0
    const pr = precision[c] + recall[c]
    f1[c] = pr > 0 ? (2 * precision[c] * recall[c]) / pr : 0
    support[c] = actualSum
  }

  return {
    classes: C,
    matrix,
    precision,
    recall,
    f1,
    support,
    accuracy: n > 0 ? correct / n : 0,
  }
}

/**
 * computeMargins — derive confidence margin (top1 - top2) per graph.
 *   probabilities : number[][]  length G × C
 */
export function computeMargins(probabilities = []) {
  return probabilities.map((probs) => {
    if (!probs?.length) return 0
    if (probs.length === 1) return probs[0]
    let top1 = -Infinity
    let top2 = -Infinity
    for (const p of probs) {
      if (p > top1) {
        top2 = top1
        top1 = p
      } else if (p > top2) {
        top2 = p
      }
    }
    if (!Number.isFinite(top2)) top2 = 0
    return Math.max(0, top1 - top2)
  })
}

/**
 * computeHardCases — top-K misclassified or low-margin graphs.
 *   snap    : snapshot object (graph_predictions, confidence_margins,
 *             graph_confidences, graph_correct?)
 *   graphs  : taskData.graphs (for groundTruth + counts)
 *   k       : max cases to return (default 10)
 *   options.onlyWrong — if true, only misclassified are considered
 */
export function computeHardCases(snap, graphs = [], k = 10, options = {}) {
  if (!snap || !graphs.length) return []
  const preds = snap.graph_predictions || []
  const confs = snap.graph_confidences || []
  const margins = snap.confidence_margins || computeMargins(snap.graph_probabilities || [])

  const items = graphs.map((g, i) => {
    const pred = preds[i]
    const gt = g?.groundTruth
    const isWrong = pred != null && gt != null && pred !== gt
    return {
      id: i,
      groundTruth: gt,
      predicted: pred,
      confidence: confs[i] ?? null,
      margin: margins[i] ?? 0,
      correct: !isWrong && pred != null,
      numNodes: g?.nodes?.length ?? g?.numNodes ?? 0,
      numEdges: g?.links?.length ?? g?.numEdges ?? 0,
    }
  })

  const pool = options.onlyWrong ? items.filter((x) => x.correct === false && x.predicted != null) : items

  // Hard = lowest margin (wrong first, then tight correct)
  pool.sort((a, b) => {
    if (a.correct !== b.correct) return a.correct ? 1 : -1
    return a.margin - b.margin
  })
  return pool.slice(0, k)
}

/**
 * buildConfidenceHistogram — bucket `graph_confidences` into `bins` groups,
 * split by correct / wrong.
 */
export function buildConfidenceHistogram(snap, bins = 10) {
  const confs = snap?.graph_confidences || []
  const correct = snap?.graph_correct || []
  const out = Array.from({ length: bins }, (_, i) => ({
    range: [i / bins, (i + 1) / bins],
    count: 0,
    correct: 0,
    wrong: 0,
  }))
  for (let i = 0; i < confs.length; i++) {
    const c = Math.max(0, Math.min(0.9999, confs[i] ?? 0))
    const idx = Math.floor(c * bins)
    out[idx].count += 1
    if (correct[i] === 1) out[idx].correct += 1
    else if (correct[i] === 0) out[idx].wrong += 1
  }
  return out
}

/**
 * computeEntropy — normalized Shannon entropy of an alpha / probability vector.
 * Used as fallback if backend did not emit attention_entropy.
 */
export function computeEntropy(values) {
  if (!values?.length) return 0
  const sum = values.reduce((s, v) => s + (v > 0 ? v : 0), 0)
  if (sum <= 0) return 0
  const n = values.length
  let h = 0
  for (const v of values) {
    if (v <= 0) continue
    const p = v / sum
    h -= p * Math.log(p)
  }
  const hmax = Math.log(n)
  return hmax > 0 ? h / hmax : 0
}

/**
 * buildDiagnosticsPoints — zip entropy + density into scatter points.
 * Used by the Diagnostics tab.
 */
export function buildDiagnosticsPoints(snap, graphs = []) {
  if (!snap) return []
  const entropies = snap.attention_entropy
    || (snap.node_contributions || []).map((arr) => computeEntropy(arr))
  const metrics = snap.graph_structural_metrics || []
  const correct = snap.graph_correct || []
  return graphs.map((g, i) => ({
    id: i,
    entropy: entropies[i] ?? 0,
    density: metrics[i]?.density ?? null,
    avgClustering: metrics[i]?.avg_clustering ?? null,
    avgDegree: metrics[i]?.avg_degree ?? null,
    correct: correct[i] === 1,
    groundTruth: g?.groundTruth,
  }))
}
