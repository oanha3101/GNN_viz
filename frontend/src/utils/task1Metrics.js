// Pure helpers for Task 1 (Node Classification) diagnostics. No React / DOM.
// Consumed by Task1MetricsPanel tabs — Confusion / Homophily / Diagnostics.

/**
 * buildConfusionMatrixK — computes a K×K confusion matrix from parallel arrays
 * of ground-truth labels and predicted labels. Rows = ground-truth, cols =
 * predicted. Returns `{ matrix, numClasses, perClass }` where `perClass[i]` is
 * `{ precision, recall, f1, support }`.
 */
export function buildConfusionMatrixK(groundTruth, predictions, K) {
  const gt = Array.isArray(groundTruth) ? groundTruth : []
  const pr = Array.isArray(predictions) ? predictions : []
  let numClasses = K | 0
  if (!numClasses || numClasses < 1) {
    let maxC = -1
    for (let i = 0; i < gt.length; i++) if (gt[i] > maxC) maxC = gt[i]
    for (let i = 0; i < pr.length; i++) if (pr[i] > maxC) maxC = pr[i]
    numClasses = Math.max(1, maxC + 1)
  }
  const matrix = Array.from({ length: numClasses }, () => new Array(numClasses).fill(0))
  const n = Math.min(gt.length, pr.length)
  for (let i = 0; i < n; i++) {
    const t = gt[i]
    const p = pr[i]
    if (!Number.isInteger(t) || !Number.isInteger(p)) continue
    if (t < 0 || p < 0 || t >= numClasses || p >= numClasses) continue
    matrix[t][p] += 1
  }
  const perClass = []
  for (let c = 0; c < numClasses; c++) {
    const tp = matrix[c][c]
    let fn = 0
    let fp = 0
    for (let j = 0; j < numClasses; j++) if (j !== c) fn += matrix[c][j]
    for (let i = 0; i < numClasses; i++) if (i !== c) fp += matrix[i][c]
    const support = tp + fn
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = support > 0 ? tp / support : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
    perClass.push({ precision, recall, f1, support })
  }
  return { matrix, numClasses, perClass }
}

/**
 * buildClassDistribution — returns two parallel arrays `{ gtCounts, predCounts }`
 * each of length K so panels can render side-by-side bars.
 */
export function buildClassDistribution(groundTruth, predictions, K) {
  const gt = Array.isArray(groundTruth) ? groundTruth : []
  const pr = Array.isArray(predictions) ? predictions : []
  let numClasses = K | 0
  if (!numClasses || numClasses < 1) {
    let maxC = -1
    for (let i = 0; i < gt.length; i++) if (gt[i] > maxC) maxC = gt[i]
    for (let i = 0; i < pr.length; i++) if (pr[i] > maxC) maxC = pr[i]
    numClasses = Math.max(1, maxC + 1)
  }
  const gtCounts = new Array(numClasses).fill(0)
  const predCounts = new Array(numClasses).fill(0)
  for (let i = 0; i < gt.length; i++) {
    const t = gt[i]
    if (Number.isInteger(t) && t >= 0 && t < numClasses) gtCounts[t] += 1
  }
  for (let i = 0; i < pr.length; i++) {
    const p = pr[i]
    if (Number.isInteger(p) && p >= 0 && p < numClasses) predCounts[p] += 1
  }
  return { numClasses, gtCounts, predCounts }
}

/**
 * extractDirichletSeries — pulls `dirichlet_energy` from each snapshot into
 * `[{ epoch, energy }]`. Non-numeric entries become 0 so Recharts still
 * renders a continuous line.
 */
export function extractDirichletSeries(snapshots) {
  if (!Array.isArray(snapshots) || !snapshots.length) return []
  return snapshots.map((s, i) => {
    const e = s?.dirichlet_energy
    return { epoch: i, energy: Number.isFinite(e) ? e : 0 }
  })
}

/**
 * computeHomophilyScatter — per-node point `{ id, ratio, correct }` where
 * `ratio` = majority_ratio (fraction of neighbors sharing the predicted class)
 * and `correct` = 1/0 from node_correctness. Nodes missing either field are
 * dropped. This powers the Homophily scatter tab: heterophilic misclassifieds
 * stand out in the low-ratio / correct=0 corner.
 */
export function computeHomophilyScatter(snapshot) {
  if (!snapshot) return []
  const ratios = snapshot.majority_ratio || snapshot.neighbor_majority_ratio
  const correctness = snapshot.node_correctness
  if (!Array.isArray(ratios) || !Array.isArray(correctness)) return []
  const n = Math.min(ratios.length, correctness.length)
  const out = []
  for (let i = 0; i < n; i++) {
    const r = ratios[i]
    const c = correctness[i]
    if (!Number.isFinite(r)) continue
    if (c !== 0 && c !== 1 && c !== true && c !== false) continue
    out.push({ id: i, ratio: Math.max(0, Math.min(1, r)), correct: c ? 1 : 0 })
  }
  return out
}
