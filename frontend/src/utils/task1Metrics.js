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

export function computeBoundaryStats(snapshot, threshold = 0.5) {
  const points = computeHomophilyScatter(snapshot)
  if (!points.length) {
    return {
      threshold,
      boundaryCount: 0,
      boundaryAccuracy: 0,
      boundaryConfidence: 0,
      interiorCount: 0,
      interiorAccuracy: 0,
      interiorConfidence: 0,
    }
  }

  const confidences = Array.isArray(snapshot?.node_confidence) ? snapshot.node_confidence : []
  const boundary = []
  const interior = []

  for (const point of points) {
    const confidence = Number.isFinite(confidences[point.id]) ? confidences[point.id] : 0
    const bucket = point.ratio < threshold ? boundary : interior
    bucket.push({ ...point, confidence })
  }

  const summarize = (items) => {
    if (!items.length) return { count: 0, accuracy: 0, confidence: 0 }
    const correct = items.reduce((sum, item) => sum + item.correct, 0)
    const confidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length
    return {
      count: items.length,
      accuracy: correct / items.length,
      confidence,
    }
  }

  const boundarySummary = summarize(boundary)
  const interiorSummary = summarize(interior)

  return {
    threshold,
    boundaryCount: boundarySummary.count,
    boundaryAccuracy: boundarySummary.accuracy,
    boundaryConfidence: boundarySummary.confidence,
    interiorCount: interiorSummary.count,
    interiorAccuracy: interiorSummary.accuracy,
    interiorConfidence: interiorSummary.confidence,
  }
}

export function computeAttentionFocus(snapshot) {
  const weights = (snapshot?.attention_edges || [])
    .map((edge) => Number(edge?.weight || 0))
    .filter((value) => Number.isFinite(value) && value > 0)

  if (!weights.length) {
    return null
  }

  const total = weights.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    return null
  }

  const normalized = weights.map((value) => value / total)
  const entropy = -normalized.reduce((sum, value) => sum + value * Math.log(value), 0)
  const maxEntropy = Math.log(normalized.length || 1) || 1
  const focus = 1 - entropy / maxEntropy
  const sorted = [...normalized].sort((a, b) => b - a)
  const topEdgeShare = sorted[0] || 0
  const top5Share = sorted.slice(0, 5).reduce((sum, value) => sum + value, 0)

  return {
    focus,
    entropy,
    topEdgeShare,
    top5Share,
    edgeCount: normalized.length,
  }
}

export function buildTask1ModelSignature({ snapshot, snapshots, model }) {
  const safeModel = model || snapshot?.model_type || 'GCN'
  const boundary = computeBoundaryStats(snapshot, 0.5)
  const homophilyPoints = computeHomophilyScatter(snapshot)
  const meanMajorityRatio = homophilyPoints.length
    ? homophilyPoints.reduce((sum, point) => sum + point.ratio, 0) / homophilyPoints.length
    : 0
  const meanConfidence = Array.isArray(snapshot?.node_confidence) && snapshot.node_confidence.length
    ? snapshot.node_confidence.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) / snapshot.node_confidence.length
    : 0

  const initialEnergy = Number.isFinite(snapshots?.[0]?.dirichlet_energy) ? snapshots[0].dirichlet_energy : null
  const currentEnergy = Number.isFinite(snapshot?.dirichlet_energy) ? snapshot.dirichlet_energy : null
  const smoothingRatio = initialEnergy && currentEnergy != null && initialEnergy > 0
    ? currentEnergy / initialEnergy
    : null

  const attention = computeAttentionFocus(snapshot)

  if (safeModel === 'GAT') {
    const focus = attention?.focus ?? 0
    const top5Share = attention?.top5Share ?? 0
    const summary = focus > 0.35
      ? 'Attention is concentrated enough to reveal boundary-sensitive links without turning the whole graph into noise.'
      : 'Attention is diffuse right now, so the model is spreading focus broadly across the graph.'
    return {
      headline: 'Attention lens',
      primaryLabel: 'Focus score',
      primaryValue: `${(focus * 100).toFixed(0)}%`,
      secondaryLabel: 'Top-5 edge share',
      secondaryValue: `${(top5Share * 100).toFixed(0)}%`,
      tertiaryLabel: 'Boundary accuracy',
      tertiaryValue: `${(boundary.boundaryAccuracy * 100).toFixed(0)}%`,
      summary,
    }
  }

  if (safeModel === 'SAGE') {
    const resilience = boundary.boundaryAccuracy
    const agreementGap = boundary.interiorAccuracy - boundary.boundaryAccuracy
    const summary = resilience > 0.7
      ? 'GraphSAGE is holding up well on boundary nodes, which is what we want from a neighborhood-aware model.'
      : 'GraphSAGE is still leaning heavily on easy neighborhoods; boundary nodes need more help.'
    return {
      headline: 'Neighborhood lens',
      primaryLabel: 'Boundary resilience',
      primaryValue: `${(resilience * 100).toFixed(0)}%`,
      secondaryLabel: 'Interior vs boundary gap',
      secondaryValue: `${(agreementGap * 100).toFixed(0)} pts`,
      tertiaryLabel: 'Mean confidence',
      tertiaryValue: `${(meanConfidence * 100).toFixed(0)}%`,
      summary,
    }
  }

  const ratioText = smoothingRatio == null ? 'n/a' : `${(smoothingRatio * 100).toFixed(0)}%`
  const summary = smoothingRatio != null && smoothingRatio < 0.08
    ? 'GCN is entering an over-smoothed regime: embeddings are collapsing faster than we would like.'
    : 'GCN is still preserving enough signal separation while benefiting from neighborhood agreement.'
  return {
    headline: 'Smoothing lens',
    primaryLabel: 'Neighborhood agreement',
    primaryValue: `${(meanMajorityRatio * 100).toFixed(0)}%`,
    secondaryLabel: 'Energy vs start',
    secondaryValue: ratioText,
    tertiaryLabel: 'Boundary accuracy',
    tertiaryValue: `${(boundary.boundaryAccuracy * 100).toFixed(0)}%`,
    summary,
  }
}

function normalizeMask(mask, fallbackLength = 0) {
  if (!Array.isArray(mask)) return null
  return Array.from({ length: Math.max(mask.length, fallbackLength) }, (_, i) => Boolean(mask[i]))
}

function countPerClass(values, numClasses) {
  const counts = Array.from({ length: numClasses }, () => 0)
  values.forEach((value) => {
    if (Number.isInteger(value) && value >= 0 && value < numClasses) {
      counts[value] += 1
    }
  })
  return counts
}

function summarizeMaskedClasses(labels, mask, numClasses) {
  const counts = Array.from({ length: numClasses }, () => 0)
  if (!mask) return counts
  const n = Math.min(labels.length, mask.length)
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue
    const label = labels[i]
    if (Number.isInteger(label) && label >= 0 && label < numClasses) {
      counts[label] += 1
    }
  }
  return counts
}

export function summarizeTask1Split({ graphData, trainMask, taskData } = {}) {
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const labels = nodes.map((node) => node?.groundTruth)
  const { numClasses } = buildClassDistribution(labels, [], 0)
  const normalizedTrainMask = normalizeMask(
    trainMask ?? nodes.map((node) => node?.inTrainSet),
    nodes.length,
  )
  const normalizedValMask = normalizeMask(taskData?.valMask, nodes.length)
  const normalizedTestMask = normalizeMask(taskData?.testMask, nodes.length)

  const totalNodes = nodes.length
  const trainCount = normalizedTrainMask ? normalizedTrainMask.filter(Boolean).length : 0
  const valCount = normalizedValMask ? normalizedValMask.filter(Boolean).length : null
  const testCount = normalizedTestMask ? normalizedTestMask.filter(Boolean).length : null
  const holdoutCount = totalNodes - trainCount

  const classTotals = countPerClass(labels, numClasses)
  const trainClassCounts = summarizeMaskedClasses(labels, normalizedTrainMask, numClasses)
  const valClassCounts = summarizeMaskedClasses(labels, normalizedValMask, numClasses)
  const testClassCounts = summarizeMaskedClasses(labels, normalizedTestMask, numClasses)

  return {
    totalNodes,
    numClasses,
    trainCount,
    valCount,
    testCount,
    holdoutCount,
    hasExactEvalMasks: Array.isArray(normalizedValMask) && Array.isArray(normalizedTestMask),
    classTotals,
    trainClassCounts,
    valClassCounts,
    testClassCounts,
  }
}

export function assessTask1Reliability({ snapshot, snapshots, graphData, trainMask, taskData, datasetName } = {}) {
  const split = summarizeTask1Split({ graphData, trainMask, taskData })
  const gt = (graphData?.nodes || []).map((node) => node?.groundTruth)
  const preds = snapshot?.node_predictions || []
  const { perClass } = buildConfusionMatrixK(gt, preds)
  const macroF1 = perClass.length ? perClass.reduce((sum, row) => sum + row.f1, 0) / perClass.length : 0
  const boundary = computeBoundaryStats(snapshot, 0.5)
  const meanConfidence = Array.isArray(snapshot?.node_confidence) && snapshot.node_confidence.length
    ? snapshot.node_confidence.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) / snapshot.node_confidence.length
    : 0
  const valAcc = Number(snapshot?.val_acc || 0)
  const trainAcc = Number(snapshot?.train_acc || 0)
  const trainLoss = Number(snapshot?.train_loss || 0)
  const recentValSeries = Array.isArray(snapshots)
    ? snapshots.slice(Math.max(0, snapshots.length - 8)).map((item) => Number(item?.val_acc || 0)).filter(Number.isFinite)
    : []
  const valSwing = recentValSeries.length ? Math.max(...recentValSeries) - Math.min(...recentValSeries) : 0

  const populatedClasses = split.classTotals.filter((count) => count > 0)
  const minClassCount = populatedClasses.length ? Math.min(...populatedClasses) : 0
  const maxClassCount = populatedClasses.length ? Math.max(...populatedClasses) : 0
  const classImbalanceRatio = maxClassCount > 0 ? minClassCount / maxClassCount : 1
  const effectiveEvalCount = split.hasExactEvalMasks
    ? (split.valCount || 0) + (split.testCount || 0)
    : split.holdoutCount

  const warnings = []

  if (split.totalNodes > 0 && split.totalNodes <= 120) {
    warnings.push({
      level: 'warn',
      code: 'small_graph',
      title: 'Small graph: each node matters a lot',
      detail: `${datasetName || 'This dataset'} has only ${split.totalNodes} nodes, so one or two validation mistakes can move the metric sharply.`,
    })
  }

  if (effectiveEvalCount > 0 && effectiveEvalCount < Math.max(12, split.numClasses * 3)) {
    warnings.push({
      level: 'warn',
      code: 'tiny_eval_split',
      title: 'Evaluation split is tiny',
      detail: `Only about ${effectiveEvalCount} nodes are outside the train split, so single-node flips can change accuracy significantly.`,
    })
  }

  if (classImbalanceRatio < 0.35 && populatedClasses.length > 1) {
    warnings.push({
      level: 'warn',
      code: 'class_imbalance',
      title: 'Class balance is uneven',
      detail: `The smallest class has ${minClassCount} nodes while the largest has ${maxClassCount}, so macro metrics matter more than raw accuracy here.`,
    })
  }

  if (valSwing >= 0.2 && effectiveEvalCount < 40) {
    warnings.push({
      level: 'warn',
      code: 'unstable_validation',
      title: 'Validation metric is swingy',
      detail: `Recent validation accuracy moved by ${(valSwing * 100).toFixed(1)} points, which usually means the eval slice is too small for a single-run conclusion.`,
    })
  }

  if (
    trainLoss <= 0.08 &&
    (
      valAcc < 0.75 ||
      macroF1 < 0.72 ||
      (boundary.boundaryCount > 0 && boundary.boundaryAccuracy < 0.55)
    )
  ) {
    warnings.push({
      level: 'danger',
      code: 'possible_memorization',
      title: 'Possible memorization or overfitting',
      detail: `Train loss is already near zero, but validation quality is still mixed. Check macro F1, boundary resilience, and the train-val gap before trusting this run.`,
    })
  }

  if (meanConfidence >= 0.85 && (macroF1 < 0.7 || valAcc < 0.7)) {
    warnings.push({
      level: 'warn',
      code: 'overconfident_predictions',
      title: 'Predictions look overconfident',
      detail: `Mean confidence is ${(meanConfidence * 100).toFixed(0)}%, but the quality metrics are not keeping up. The model may be confidently wrong on hard nodes.`,
    })
  }

  return {
    split,
    macroF1,
    valAcc,
    trainAcc,
    trainLoss,
    trainValGap: trainAcc - valAcc,
    meanConfidence,
    boundary,
    classImbalanceRatio,
    valSwing,
    warnings,
    status: warnings.some((item) => item.level === 'danger') ? 'danger' : warnings.length ? 'warn' : 'healthy',
  }
}
