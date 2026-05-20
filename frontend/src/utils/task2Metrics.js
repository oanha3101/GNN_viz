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
    const sourceIndex = g?.sourceIndex ?? i
    const pred = preds[sourceIndex]
    const gt = g?.groundTruth
    const isWrong = pred != null && gt != null && pred !== gt
    return {
      id: g?.originalGraphId ?? i,
      sourceIndex,
      groundTruth: gt,
      predicted: pred,
      confidence: confs[sourceIndex] ?? null,
      margin: margins[sourceIndex] ?? 0,
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
  const predictions = snap.graph_predictions || []
  const confidences = snap.graph_confidences || []
  const margins = snap.confidence_margins || computeMargins(snap.graph_probabilities || [])
  const correct = snap.graph_correct || []
  return graphs.map((g, i) => ({
    id: g?.originalGraphId ?? i,
    sourceIndex: g?.sourceIndex ?? i,
    entropy: entropies[g?.sourceIndex ?? i] ?? 0,
    density: metrics[g?.sourceIndex ?? i]?.density ?? null,
    avgClustering: metrics[g?.sourceIndex ?? i]?.avg_clustering ?? null,
    avgDegree: metrics[g?.sourceIndex ?? i]?.avg_degree ?? null,
    predicted: g?.predicted ?? predictions[g?.sourceIndex ?? i] ?? null,
    confidence: g?.confidence ?? confidences[g?.sourceIndex ?? i] ?? null,
    margin: g?.margin ?? margins[g?.sourceIndex ?? i] ?? null,
    correct: correct[g?.sourceIndex ?? i] === 1,
    groundTruth: g?.groundTruth,
  }))
}

export function summarizeGraphCollection(graphs = [], classNames = []) {
  const totalGraphs = graphs.length
  const totalNodes = graphs.reduce((sum, graph) => sum + (graph?.nodes?.length ?? graph?.numNodes ?? 0), 0)
  const totalEdges = graphs.reduce((sum, graph) => sum + (graph?.links?.length ?? graph?.numEdges ?? 0), 0)

  const counts = new Map()
  for (const graph of graphs) {
    if (!Number.isInteger(graph?.groundTruth)) continue
    counts.set(graph.groundTruth, (counts.get(graph.groundTruth) || 0) + 1)
  }

  const classCounts = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([classId, support]) => ({
      classId,
      label: classNames[classId] || `Class ${classId}`,
      support,
      share: totalGraphs > 0 ? support / totalGraphs : 0,
    }))

  return {
    totalGraphs,
    totalNodes,
    totalEdges,
    avgNodes: totalGraphs > 0 ? totalNodes / totalGraphs : 0,
    avgEdges: totalGraphs > 0 ? totalEdges / totalGraphs : 0,
    classCounts,
  }
}

export function bucketTask2Density(value) {
  if (!Number.isFinite(value)) return 'sparse'
  if (value < 0.2) return 'sparse'
  if (value < 0.5) return 'medium'
  return 'dense'
}

export function bucketTask2Entropy(value) {
  if (!Number.isFinite(value)) return 'concentrated'
  if (value < 0.35) return 'concentrated'
  if (value < 0.7) return 'balanced'
  return 'diffuse'
}

export function bucketTask2Clustering(value) {
  if (!Number.isFinite(value)) return 'low'
  if (value < 0.25) return 'low'
  if (value < 0.55) return 'medium'
  return 'high'
}

export function bucketTask2ReadoutConcentration(value) {
  if (!Number.isFinite(value)) return 'diffuse'
  if (value >= 0.7) return 'concentrated'
  if (value >= 0.45) return 'mixed'
  return 'diffuse'
}

export function computeTask2ReadoutConcentration(contributions = []) {
  const top = contributions
    .map((value, nodeId) => ({ nodeId, value: Math.max(0, Number(value) || 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)

  if (!top.length) {
    return { score: 0, topContributors: [] }
  }

  const score = top.reduce((sum, item) => sum + item.value, 0)
  return {
    score: Math.max(0, Math.min(1, score)),
    topContributors: top,
  }
}

export function describeTask2MotifSignature({ densityBucket, clusteringBucket, readoutBucket, avgDegree = 0 }) {
  if (densityBucket === 'sparse' && readoutBucket === 'diffuse') {
    return 'sparse graph, weak local motif'
  }
  if (densityBucket === 'dense' && clusteringBucket === 'high' && readoutBucket === 'concentrated') {
    return 'dense cohesive motif'
  }
  if (clusteringBucket === 'high' && readoutBucket === 'concentrated') {
    return 'clustered motif with focused readout'
  }
  if (avgDegree >= 4 && readoutBucket === 'diffuse') {
    return 'hub-heavy but diffuse'
  }
  if (readoutBucket === 'concentrated') {
    return 'concentrated readout on compact motif'
  }
  if (densityBucket === 'medium' && clusteringBucket === 'medium') {
    return 'balanced structural cue'
  }
  return 'mixed structural cue'
}

export function describeTask2FailureTag({
  correct,
  confidence = null,
  margin = null,
  readoutBucket = 'diffuse',
  entropyBucket = 'balanced',
  structuralOutlier = false,
}) {
  if (correct === 0 && Number.isFinite(confidence) && confidence >= 0.75) {
    return 'overconfident_miss'
  }
  if (readoutBucket === 'diffuse' && entropyBucket === 'diffuse') {
    return 'diffuse_readout'
  }
  if (structuralOutlier) {
    return 'structural_outlier'
  }
  if (Number.isFinite(margin) && margin < 0.12) {
    return 'boundary_case'
  }
  if (correct === 1) {
    return 'stable_win'
  }
  return 'boundary_case'
}

export function buildTask2GraphDescriptors({ snapshot, graphs = [], classNames = [] }) {
  const normalizedGraphs = graphs.map((graph, index) => ({
    ...(graph || {}),
    originalGraphId: Number.isInteger(graph?.originalGraphId) ? graph.originalGraphId : index,
    sourceIndex: Number.isInteger(graph?.sourceIndex) ? graph.sourceIndex : index,
  }))

  const structuralMetrics = snapshot?.graph_structural_metrics || []
  const densityValues = structuralMetrics.map((item) => item?.density).filter(Number.isFinite)
  const clusteringValues = structuralMetrics.map((item) => item?.avg_clustering).filter(Number.isFinite)
  const degreeValues = structuralMetrics.map((item) => item?.avg_degree).filter(Number.isFinite)

  const meanDensity = average(densityValues)
  const meanClustering = average(clusteringValues)
  const meanDegree = average(degreeValues)

  return normalizedGraphs.map((graph) => {
    const sourceIndex = graph.sourceIndex ?? 0
    const groundTruth = Number.isInteger(graph?.groundTruth) ? graph.groundTruth : null
    const predicted = snapshot?.graph_predictions?.[sourceIndex] ?? null
    const confidence = snapshot?.graph_confidences?.[sourceIndex] ?? null
    const margin = snapshot?.confidence_margins?.[sourceIndex] ?? null
    const structural = snapshot?.graph_structural_metrics?.[sourceIndex] || null
    const contributions = snapshot?.node_contributions?.[sourceIndex] || []
    const entropy = snapshot?.attention_entropy?.[sourceIndex] ?? computeEntropy(contributions)
    const readout = computeTask2ReadoutConcentration(contributions)
    const correct = snapshot?.graph_correct?.[sourceIndex] ?? (
      predicted != null && groundTruth != null ? Number(predicted === groundTruth) : null
    )

    const densityBucket = bucketTask2Density(structural?.density)
    const entropyBucket = bucketTask2Entropy(entropy)
    const clusteringBucket = bucketTask2Clustering(structural?.avg_clustering)
    const readoutBucket = bucketTask2ReadoutConcentration(readout.score)
    const structuralOutlierScore = structural
      ? Math.min(
        1,
        Math.abs((structural.density ?? meanDensity) - meanDensity) * 2.2 +
        Math.abs((structural.avg_clustering ?? meanClustering) - meanClustering) * 1.7 +
        Math.abs((structural.avg_degree ?? meanDegree) - meanDegree) * 0.08,
      )
      : 0
    const structuralOutlier = structuralOutlierScore >= 0.65

    return {
      ...graph,
      originalGraphId: graph.originalGraphId,
      sourceIndex,
      groundTruth,
      predicted,
      confidence,
      margin,
      entropy,
      structural,
      densityBucket,
      entropyBucket,
      clusteringBucket,
      readoutConcentration: readout.score,
      readoutBucket,
      motifSignature: describeTask2MotifSignature({
        densityBucket,
        clusteringBucket,
        readoutBucket,
        avgDegree: structural?.avg_degree ?? meanDegree,
      }),
      failureTag: describeTask2FailureTag({
        correct,
        confidence,
        margin,
        readoutBucket,
        entropyBucket,
        structuralOutlier,
      }),
      structuralOutlierScore,
      structuralOutlier,
      topContributors: readout.topContributors,
      classLabel: Number.isInteger(groundTruth) && classNames?.[groundTruth]
        ? classNames[groundTruth]
        : null,
      predictedLabel: Number.isInteger(predicted) && classNames?.[predicted]
        ? classNames[predicted]
        : null,
      correct,
    }
  })
}

export function filterTask2DescriptorsByCell(descriptors = [], selectedCell = null) {
  if (!selectedCell) return descriptors
  return descriptors.filter((descriptor) => (
    descriptor?.predicted === selectedCell.pred && descriptor?.groundTruth === selectedCell.gt
  ))
}

export function sortTask2Descriptors(descriptors = [], sortMode = 'priority') {
  const items = [...descriptors]
  const compareNumber = (a, b, direction = 1) => {
    const av = Number.isFinite(a) ? a : (direction < 0 ? -Infinity : Infinity)
    const bv = Number.isFinite(b) ? b : (direction < 0 ? -Infinity : Infinity)
    return (av - bv) * direction
  }

  switch (sortMode) {
    case 'confidence_desc':
      return items.sort((a, b) => compareNumber(b.confidence, a.confidence, 1) || compareNumber(a.margin, b.margin, 1))
    case 'entropy_desc':
      return items.sort((a, b) => compareNumber(b.entropy, a.entropy, 1) || compareNumber(a.margin, b.margin, 1))
    case 'size_desc':
      return items.sort((a, b) => compareNumber((b.nodes?.length ?? b.numNodes ?? 0), (a.nodes?.length ?? a.numNodes ?? 0), 1))
    case 'priority':
    default:
      return items.sort((a, b) => {
        if ((a.correct === 0) !== (b.correct === 0)) return (a.correct === 0 ? -1 : 1)
        if (Number.isFinite(a.margin) || Number.isFinite(b.margin)) {
          const marginDelta = compareNumber(a.margin, b.margin, 1)
          if (marginDelta !== 0) return marginDelta
        }
        if (Number.isFinite(a.entropy) || Number.isFinite(b.entropy)) {
          const entropyDelta = compareNumber(b.entropy, a.entropy, 1)
          if (entropyDelta !== 0) return entropyDelta
        }
        return compareNumber(b.structuralOutlierScore, a.structuralOutlierScore, 1)
      })
  }
}

export function buildTask2NarrativeSummary(descriptors = [], reliability = null) {
  const wrong = descriptors.filter((item) => item.correct === 0)
  const wrongHighConf = wrong.filter((item) => Number.isFinite(item.confidence) && item.confidence >= 0.75)
  const diffuse = descriptors.filter((item) => item.failureTag === 'diffuse_readout')
  const outliers = descriptors.filter((item) => item.failureTag === 'structural_outlier')
  const boundary = descriptors.filter((item) => item.failureTag === 'boundary_case')
  const stable = descriptors.filter((item) => item.failureTag === 'stable_win')

  let mainInsight = 'The slice is mostly stable, but boundary examples still deserve attention.'
  if (wrongHighConf.length) {
    mainInsight = `The model is making ${wrongHighConf.length} overconfident mistake${wrongHighConf.length === 1 ? '' : 's'} on this slice.`
  } else if (diffuse.length) {
    mainInsight = `Diffuse readout dominates ${diffuse.length} graph${diffuse.length === 1 ? '' : 's'} in this slice.`
  } else if (outliers.length) {
    mainInsight = `Structural outliers are the strongest signal in this slice.`
  } else if (stable.length >= descriptors.length * 0.6) {
    mainInsight = 'Most graphs are stable wins, so the remaining errors are likely boundary cases.'
  }

  let mainRisk = 'Confidence and Macro F1 should be read together before trusting the benchmark story.'
  if (reliability?.status === 'danger') {
    mainRisk = reliability.readingGuide
  } else if (wrongHighConf.length) {
    mainRisk = 'Overconfident misses suggest the classifier is trusting the wrong motif shape.'
  } else if (descriptors.some((item) => item.margin != null && item.margin < 0.12)) {
    mainRisk = 'Thin margins mean the decision boundary is still fragile.'
  }

  let recommendedNextLens = 'Use the Failure tab to isolate the hardest graphs.'
  if (outliers.length) {
    recommendedNextLens = 'Use the Structure tab to inspect structural outliers.'
  } else if (wrongHighConf.length) {
    recommendedNextLens = 'Use the Readout tab to inspect overconfident misses.'
  } else if (boundary.length) {
    recommendedNextLens = 'Use the Failures tab to inspect boundary cases.'
  }

  return {
    mainInsight,
    mainRisk,
    recommendedNextLens,
  }
}

export function buildTask2BestEpochSuggestion(snapshots = []) {
  if (!Array.isArray(snapshots) || !snapshots.length) {
    return null
  }

  const epochs = snapshots
    .map((snapshot, index) => {
      const epoch = Number.isInteger(snapshot?.epoch) ? snapshot.epoch : index
      const macroF1 = Number(snapshot?.macro_f1 ?? snapshot?.graph_macro_f1)
      const balancedAccuracy = Number(snapshot?.balanced_accuracy ?? snapshot?.graph_balanced_accuracy)
      const accuracy = Number(snapshot?.val_acc ?? snapshot?.accuracy ?? snapshot?.train_acc)
      const margin = Number(snapshot?.median_margin ?? snapshot?.graph_median_margin)
      return {
        epoch,
        macroF1: Number.isFinite(macroF1) ? macroF1 : null,
        balancedAccuracy: Number.isFinite(balancedAccuracy) ? balancedAccuracy : null,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        margin: Number.isFinite(margin) ? margin : null,
      }
    })
    .filter((row) => row.macroF1 != null || row.balancedAccuracy != null || row.accuracy != null)

  if (!epochs.length) return null

  const pickBest = (primaryKey, secondaryKey) => [...epochs].sort((a, b) => {
    const primaryDelta = (b[primaryKey] ?? -Infinity) - (a[primaryKey] ?? -Infinity)
    if (primaryDelta !== 0) return primaryDelta
    const secondaryDelta = (b[secondaryKey] ?? -Infinity) - (a[secondaryKey] ?? -Infinity)
    if (secondaryDelta !== 0) return secondaryDelta
    const accuracyDelta = (b.accuracy ?? -Infinity) - (a.accuracy ?? -Infinity)
    if (accuracyDelta !== 0) return accuracyDelta
    return a.epoch - b.epoch
  })[0]

  const bestMacro = pickBest('macroF1', 'balancedAccuracy')
  const bestBalanced = pickBest('balancedAccuracy', 'macroF1')
  const sameEpoch = bestMacro?.epoch === bestBalanced?.epoch

  let recommendation = `Best read: epoch ${bestMacro?.epoch} by Macro F1`
  if (sameEpoch) {
    recommendation += ` and Balanced Acc`
  }
  recommendation += '.'

  let rationale = 'Use this epoch when you care more about class balance and weak-class recall than raw accuracy.'
  if (!sameEpoch && bestBalanced) {
    rationale = `Macro F1 peaks at epoch ${bestMacro?.epoch}, while Balanced Acc peaks at epoch ${bestBalanced.epoch}. Use the Macro F1 peak for headline reading, then compare the Balanced Acc peak if weak-class recall is the priority.`
  }

  return {
    bestMacro,
    bestBalanced,
    sameEpoch,
    recommendation,
    rationale,
  }
}

export function buildTask2ResearchSignals({ snapshot, graphs = [], classNames = [], reliability = null, descriptors = [] }) {
  const graphLabels = summarizeGraphCollection(graphs, classNames).classCounts
  const labelFor = (classId) => classNames?.[classId] || `Class ${classId}`
  const predictions = snapshot?.graph_predictions || []
  const predictedCounts = new Map()
  for (const pred of predictions) {
    if (!Number.isInteger(pred)) continue
    predictedCounts.set(pred, (predictedCounts.get(pred) || 0) + 1)
  }
  const dominantPrediction = [...predictedCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null
  const dominantPredClass = dominantPrediction?.[0] ?? null
  const dominantPredShare = predictions.length > 0 ? (dominantPrediction?.[1] || 0) / predictions.length : 0

  const perClass = reliability?.metrics?.perClass || []
  const supportedRows = perClass.filter((row) => (row?.support || 0) > 0)
  const weakestClass = supportedRows.length
    ? [...supportedRows].sort((a, b) => (a.recall || 0) - (b.recall || 0))[0]
    : null
  const balancedAccuracy = reliability?.metrics?.balancedAccuracy || 0
  const overconfidentMisses = descriptors.filter((descriptor) => descriptor.failureTag === 'overconfident_miss')
  const collapseMisses = weakestClass
    ? descriptors.filter((descriptor) => (
      descriptor.groundTruth === weakestClass.class_id
      && descriptor.predicted != null
      && descriptor.predicted !== descriptor.groundTruth
    ))
    : []

  const collapse = {
    id: 'collapse',
    title: 'Class collapse',
    status: 'ok',
    summary: 'Predictions are spread across classes without an obvious collapse pattern.',
    evidence: 'Per-class recall and prediction share are staying within a usable range.',
    recommendation: 'Use Failures to inspect the remaining boundary graphs.',
  }

  if (weakestClass && dominantPredClass != null && dominantPredShare >= 0.68 && (weakestClass.recall || 0) <= 0.35) {
    collapse.status = 'danger'
    collapse.summary = `Predictions are collapsing toward ${labelFor(dominantPredClass)} while ${labelFor(weakestClass.class_id)} recall is only ${((weakestClass.recall || 0) * 100).toFixed(1)}%.`
    collapse.evidence = `${collapseMisses.length} graph${collapseMisses.length === 1 ? '' : 's'} from the weak class are being absorbed into the dominant prediction stream.`
    collapse.recommendation = 'Use Failures first, then inspect readout on overconfident misses from the weak class.'
  } else if (weakestClass && (weakestClass.recall || 0) < 0.6) {
    collapse.status = 'warn'
    collapse.summary = `${labelFor(weakestClass.class_id)} is still the weak class with recall at ${((weakestClass.recall || 0) * 100).toFixed(1)}%.`
    collapse.evidence = `Prediction share is leaning ${dominantPredClass != null ? `toward ${labelFor(dominantPredClass)}` : 'toward one class'}${dominantPredShare ? ` (${(dominantPredShare * 100).toFixed(1)}%)` : ''}, and balanced accuracy is ${(balancedAccuracy * 100).toFixed(1)}%.`
    collapse.recommendation = 'Keep reading Macro F1 and confusion together before trusting the accuracy story.'
  }

  const ece = reliability?.metrics?.calibrationEce
  const wrongMeanConfidence = reliability?.metrics?.wrongMeanConfidence || 0
  const calibration = {
    id: 'calibration',
    title: 'Calibration',
    status: 'ok',
    summary: 'Confidence is tracking correctness closely enough for visual interpretation.',
    evidence: Number.isFinite(ece)
      ? `ECE is ${(ece * 100).toFixed(1)}% and wrong graphs are averaging ${(wrongMeanConfidence * 100).toFixed(1)}% confidence.`
      : 'Calibration payload is unavailable for this slice.',
    recommendation: 'Use Readout to validate the most confident mistakes before exporting conclusions.',
  }

  if ((Number.isFinite(ece) && ece >= 0.18) || overconfidentMisses.length >= 3) {
    calibration.status = 'danger'
    calibration.summary = `High-confidence predictions are not lining up cleanly with correctness on this slice.`
    calibration.evidence = `${overconfidentMisses.length} overconfident miss${overconfidentMisses.length === 1 ? '' : 'es'} detected${Number.isFinite(ece) ? ` and ECE is ${(ece * 100).toFixed(1)}%` : ''}.`
    calibration.recommendation = 'Treat confidence as a ranking cue, not proof. Inspect the Failure and Readout tabs together.'
  } else if ((Number.isFinite(ece) && ece >= 0.1) || wrongMeanConfidence >= 0.6) {
    calibration.status = 'warn'
    calibration.summary = 'Confidence is usable, but it still runs ahead of true reliability.'
    calibration.evidence = `${Number.isFinite(ece) ? `ECE is ${(ece * 100).toFixed(1)}%` : 'Calibration is only partially available'} and wrong graphs are averaging ${(wrongMeanConfidence * 100).toFixed(1)}% confidence.`
    calibration.recommendation = 'Compare confidence with margins and hard-case slices before trusting graph-level certainty.'
  }

  const densityBias = reliability?.metrics?.densityBias || 0
  const sizeBias = reliability?.metrics?.sizeBias || 0
  const edgeBias = reliability?.metrics?.edgeBias || 0
  const shortcut = {
    id: 'shortcut',
    title: 'Shortcut bias',
    status: 'ok',
    summary: 'No strong structural shortcut is dominating confidence on this slice.',
    evidence: `Conf vs density ${densityBias.toFixed(2)}, size ${sizeBias.toFixed(2)}, edges ${edgeBias.toFixed(2)}.`,
    recommendation: 'Use Structure for motif reading, not just for shortcut checking.',
  }

  if (Math.abs(densityBias) >= 0.5 || Math.abs(sizeBias) >= 0.5) {
    const stronger = Math.abs(densityBias) >= Math.abs(sizeBias) ? 'density' : 'graph size'
    shortcut.status = 'danger'
    shortcut.summary = `Confidence is strongly correlated with ${stronger}, so the model may be using a structural shortcut.`
    shortcut.evidence = `The strongest correlation is ${stronger === 'density' ? densityBias.toFixed(2) : sizeBias.toFixed(2)} and should be treated as a bias signal, not a motif explanation.`
    shortcut.recommendation = 'Use Structure to inspect whether hard cases cluster by topology before trusting motif-level language.'
  } else if (Math.abs(densityBias) >= 0.3 || Math.abs(sizeBias) >= 0.3 || Math.abs(edgeBias) >= 0.3) {
    shortcut.status = 'warn'
    shortcut.summary = 'There is a mild structural shortcut signal in the confidence pattern.'
    shortcut.evidence = `Conf vs density ${densityBias.toFixed(2)}, size ${sizeBias.toFixed(2)}, edges ${edgeBias.toFixed(2)}.`
    shortcut.recommendation = 'Cross-check topology slices with misclassified graphs to confirm the model is reading motifs, not just size cues.'
  }

  return {
    collapse,
    calibration,
    shortcut,
    collection: graphLabels,
  }
}

export function buildTask2FocusStory({ reliability = null, descriptors = [], classNames = [] }) {
  const weakClass = reliability?.metrics?.weakClass || null
  const densityBias = reliability?.metrics?.densityBias || 0
  const sizeBias = reliability?.metrics?.sizeBias || 0
  const weakLabel = weakClass?.label || (Number.isInteger(weakClass?.classId) ? (classNames?.[weakClass.classId] || `Class ${weakClass.classId}`) : 'the weak class')
  const weakClassMisses = weakClass
    ? descriptors.filter((descriptor) => descriptor.groundTruth === weakClass.classId && descriptor.correct === 0)
    : []
  const denseMisses = weakClassMisses.filter((descriptor) => descriptor.densityBucket === 'dense')
  const highConfidenceMisses = weakClassMisses.filter((descriptor) => Number.isFinite(descriptor.confidence) && descriptor.confidence >= 0.75)

  const riskLevel = Math.abs(densityBias) >= 0.5 || highConfidenceMisses.length >= 3
    ? 'danger'
    : Math.abs(densityBias) >= 0.3 || weakClassMisses.length > 0
      ? 'warn'
      : 'ok'

  let summary = 'Weak-class misses and density shortcut do not appear tightly coupled on this slice.'
  if (weakClass && weakClassMisses.length) {
    summary = `${weakLabel} has ${weakClassMisses.length} miss${weakClassMisses.length === 1 ? '' : 'es'} in the current slice.`
    if (Math.abs(densityBias) >= 0.3) {
      summary += ` Confidence is also correlated with density (${densityBias.toFixed(2)}), so check whether those misses cluster on dense graphs.`
    }
  }

  const evidenceParts = []
  if (weakClass) {
    evidenceParts.push(`${weakLabel} recall ${(weakClass.recall * 100).toFixed(1)}%`)
  }
  evidenceParts.push(`Conf vs density ${densityBias.toFixed(2)}`)
  if (Number.isFinite(sizeBias)) {
    evidenceParts.push(`Conf vs size ${sizeBias.toFixed(2)}`)
  }
  if (denseMisses.length) {
    evidenceParts.push(`${denseMisses.length} weak-class miss${denseMisses.length === 1 ? '' : 'es'} are density-heavy`)
  }
  if (highConfidenceMisses.length) {
    evidenceParts.push(`${highConfidenceMisses.length} weak-class miss${highConfidenceMisses.length === 1 ? '' : 'es'} are high-confidence`)
  }

  return {
    id: 'density_vs_weak_class',
    title: 'Density shortcut vs weak-class misses',
    status: riskLevel,
    summary,
    evidence: evidenceParts.join(' · '),
    weakClassFocusId: 'weak_class',
    structureFocusId: 'outlier',
  }
}

export function getTask2DescriptorById(descriptors = [], graphId) {
  return descriptors.find((descriptor) => descriptor.originalGraphId === graphId) || null
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(value))
  if (!valid.length) return 0
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function pickCalibration(snapshot) {
  const calibration = snapshot?.graph_calibration
  if (calibration && typeof calibration === 'object') return calibration
  return null
}

function median(values = []) {
  const valid = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!valid.length) return 0
  const mid = Math.floor(valid.length / 2)
  return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid]
}

function percentile(values = [], ratio = 0.5) {
  const valid = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!valid.length) return 0
  const idx = Math.max(0, Math.min(valid.length - 1, Math.floor((valid.length - 1) * ratio)))
  return valid[idx]
}

export function assessTask2Reliability({ snapshot, graphs = [], classNames = [] }) {
  const summary = summarizeGraphCollection(graphs, classNames)
  const groundTruth = graphs.map((graph) => graph?.groundTruth)
  const predictions = snapshot?.graph_predictions || []
  const confusion = buildConfusionMatrix(predictions, groundTruth)
  const macroF1 = confusion.f1.length
    ? confusion.f1.reduce((sum, value) => sum + value, 0) / confusion.f1.length
    : 0

  const margins = snapshot?.confidence_margins || computeMargins(snapshot?.graph_probabilities || [])
  const confs = snapshot?.graph_confidences || []
  const correct = snapshot?.graph_correct || groundTruth.map((gt, i) => (
    predictions[i] != null && gt != null && predictions[i] === gt ? 1 : 0
  ))
  const wrongConfidences = confs.filter((_, i) => correct[i] === 0)
  const entropies = snapshot?.attention_entropy
    || (snapshot?.node_contributions || []).map((arr) => computeEntropy(arr))
  const calibration = pickCalibration(snapshot)
  const structuralBias = snapshot?.structural_bias_signals || {}
  const perClassRows = snapshot?.graph_per_class_metrics || confusion.support.map((support, classId) => ({
    class_id: classId,
    support,
    precision: confusion.precision[classId] || 0,
    recall: confusion.recall[classId] || 0,
    f1: confusion.f1[classId] || 0,
    mean_confidence: 0,
  }))
  const supportedRows = perClassRows.filter((row) => (row?.support || 0) > 0)
  const balancedAccuracy = supportedRows.length
    ? supportedRows.reduce((sum, row) => sum + (row.recall || 0), 0) / supportedRows.length
    : 0
  const weakClassRow = supportedRows.length
    ? [...supportedRows].sort((a, b) => (a.recall || 0) - (b.recall || 0))[0]
    : null

  const warnings = []
  let status = 'ok'

  const minSupport = summary.classCounts.length
    ? Math.min(...summary.classCounts.map((item) => item.support))
    : 0
  const maxSupport = summary.classCounts.length
    ? Math.max(...summary.classCounts.map((item) => item.support))
    : 0
  const maxShare = summary.classCounts.length
    ? Math.max(...summary.classCounts.map((item) => item.share))
    : 0

  if (summary.totalGraphs > 0 && summary.totalGraphs < 40) {
    status = 'warn'
    warnings.push('This dataset has relatively few graphs, so single mistakes can move metrics more than expected.')
  }
  if (minSupport > 0 && minSupport < 5) {
    status = 'danger'
    warnings.push('At least one class has fewer than 5 graphs. Read confusion and Macro F1 before trusting accuracy.')
  } else if (maxSupport > 0 && minSupport > 0 && maxSupport / minSupport >= 3) {
    status = status === 'danger' ? status : 'warn'
    warnings.push('Class balance is skewed. Accuracy may look healthy even when minority graph types are weak.')
  } else if (maxShare >= 0.55) {
    status = status === 'danger' ? status : 'warn'
    warnings.push('One class dominates the collection, so compare confidence and per-class recall together.')
  }

  if ((confusion.accuracy - macroF1) > 0.12) {
    status = status === 'danger' ? status : 'warn'
    warnings.push('Accuracy is outpacing Macro F1. The model may be winning on common graphs while missing rarer motifs.')
  }

  if (wrongConfidences.length >= 2 && average(wrongConfidences) > 0.75) {
    status = status === 'danger' ? status : 'warn'
    warnings.push('Wrong graphs still carry high confidence. This looks like overconfident graph-level reasoning.')
  }

  if (Number.isFinite(calibration?.ece) && calibration.ece > 0.12) {
    status = status === 'danger' ? status : 'warn'
    warnings.push('Confidence calibration is weak. High-probability predictions are not aligning well with actual correctness.')
  }

  if (margins.length >= 5 && median(margins) < 0.12) {
    status = status === 'danger' ? status : 'warn'
    warnings.push('Many graphs have thin top-1 vs top-2 margins. The class boundary is still fragile.')
  }

  if (entropies.length >= 5 && average(entropies) > 0.82) {
    status = status === 'danger' ? status : 'warn'
    warnings.push('Readout attention is diffuse on average. Inspect which graphs rely on many weak signals instead of one motif.')
  }

  const densityBias = Math.abs(structuralBias?.confidence_vs_density || 0)
  const sizeBias = Math.abs(structuralBias?.confidence_vs_num_nodes || 0)
  if (densityBias > 0.35 || sizeBias > 0.35) {
    status = status === 'danger' ? status : 'warn'
    warnings.push('Confidence is correlating with graph size or density. Inspect whether the model is leaning on structural shortcuts.')
  }

  return {
    status,
    warnings,
    summary,
    metrics: {
      accuracy: confusion.accuracy,
      macroF1,
      balancedAccuracy,
      meanConfidence: average(confs),
      medianMargin: median(margins),
      meanEntropy: average(entropies),
      wrongMeanConfidence: average(wrongConfidences),
      calibrationEce: calibration?.ece ?? null,
      densityBias: structuralBias?.confidence_vs_density ?? 0,
      sizeBias: structuralBias?.confidence_vs_num_nodes ?? 0,
      edgeBias: structuralBias?.confidence_vs_num_edges ?? 0,
      perClass: perClassRows,
      weakClass: weakClassRow ? {
        classId: weakClassRow.class_id,
        label: classNames?.[weakClassRow.class_id] || `Class ${weakClassRow.class_id}`,
        recall: weakClassRow.recall || 0,
        precision: weakClassRow.precision || 0,
        f1: weakClassRow.f1 || 0,
        support: weakClassRow.support || 0,
      } : null,
    },
    readingGuide:
      summary.totalGraphs < 40 || minSupport < 5
        ? 'Treat this collection more like a motif probe than a benchmark. Use confusion, margins, and structural slices together.'
        : 'Use accuracy for trend, but confirm with Macro F1, hard cases, and readout concentration before concluding the model is robust.',
  }
}

export function buildTask2FocusBuckets({ snapshot, graphs = [], classNames = [] }) {
  const total = graphs.length
  const graphIds = graphs.map((graph, index) => graph?.originalGraphId ?? index)
  const margins = snapshot?.confidence_margins || computeMargins(snapshot?.graph_probabilities || [])
  const entropies = snapshot?.attention_entropy
    || (snapshot?.node_contributions || []).map((arr) => computeEntropy(arr))
  const structural = snapshot?.graph_structural_metrics || []
  const predictions = snapshot?.graph_predictions || []
  const correct = snapshot?.graph_correct || graphs.map((graph, index) => (
    predictions[index] != null && graph?.groundTruth != null && predictions[index] === graph.groundTruth ? 1 : 0
  ))
  const confusion = buildConfusionMatrix(predictions, graphs.map((graph) => graph?.groundTruth))
  const weakClassRow = confusion.support.length
    ? confusion.support
      .map((support, classId) => ({ classId, support, recall: confusion.recall[classId] || 0 }))
      .filter((row) => row.support > 0)
      .sort((a, b) => a.recall - b.recall)[0]
    : null
  const weakClassId = weakClassRow?.classId ?? null
  const weakClassLabel = Number.isInteger(weakClassId) ? (classNames?.[weakClassId] || `Class ${weakClassId}`) : 'Weak class'

  const marginCutoff = total >= 4 ? percentile(margins, 0.25) : 0.12
  const entropyCutoff = total >= 4 ? Math.max(0.7, percentile(entropies, 0.75)) : 0.75

  const densityValues = structural.map((item) => item?.density).filter(Number.isFinite)
  const clusterValues = structural.map((item) => item?.avg_clustering).filter(Number.isFinite)
  const meanDensity = average(densityValues)
  const meanCluster = average(clusterValues)

  const focusSets = {
    all: graphIds,
    failures: graphIds.filter((_, index) => correct[graphs[index]?.sourceIndex ?? index] === 0),
    weak_class: Number.isInteger(weakClassId)
      ? graphIds.filter((_, index) => {
        const sourceIndex = graphs[index]?.sourceIndex ?? index
        return graphs[index]?.groundTruth === weakClassId && correct[sourceIndex] === 0
      })
      : [],
    low_margin: graphIds.filter((_, index) => Number.isFinite(margins[graphs[index]?.sourceIndex ?? index]) && margins[graphs[index]?.sourceIndex ?? index] <= marginCutoff),
    diffuse: graphIds.filter((_, index) => Number.isFinite(entropies[graphs[index]?.sourceIndex ?? index]) && entropies[graphs[index]?.sourceIndex ?? index] >= entropyCutoff),
    outlier: graphIds.filter((_, index) => {
      const sourceIndex = graphs[index]?.sourceIndex ?? index
      const metrics = structural[sourceIndex]
      if (!metrics) return false
      const density = Number.isFinite(metrics.density) ? metrics.density : meanDensity
      const clustering = Number.isFinite(metrics.avg_clustering) ? metrics.avg_clustering : meanCluster
      return Math.abs(density - meanDensity) > 0.22 || Math.abs(clustering - meanCluster) > 0.22
    }),
  }

  return [
    {
      id: 'all',
      label: 'All',
      description: 'Entire graph collection.',
      graphIds: focusSets.all,
    },
    {
      id: 'failures',
      label: 'Misclassified',
      description: 'Graphs the model currently gets wrong.',
      graphIds: focusSets.failures,
    },
    {
      id: 'weak_class',
      label: 'Weak-class misses',
      description: `Errors whose ground truth is ${weakClassLabel}. Use this slice to inspect why recall is lagging on the weakest class.`,
      graphIds: focusSets.weak_class,
    },
    {
      id: 'low_margin',
      label: 'Low margin',
      description: 'Graphs sitting near the decision boundary.',
      graphIds: focusSets.low_margin,
    },
    {
      id: 'diffuse',
      label: 'Diffuse readout',
      description: 'Graphs whose node attention is spread across many weak signals.',
      graphIds: focusSets.diffuse,
    },
    {
      id: 'outlier',
      label: 'Structural outlier',
      description: 'Graphs whose density or clustering departs from the collection norm.',
      graphIds: focusSets.outlier,
    },
  ]
}

export function filterTask2Snapshot(snapshot, graphIds = [], graphs = []) {
  if (!snapshot) return null
  const indexLookup = new Map(
    graphs.map((graph, index) => [graph?.originalGraphId ?? index, graph?.sourceIndex ?? index])
  )
  const indices = graphIds
    .map((graphId) => indexLookup.get(graphId))
    .filter((value) => Number.isInteger(value))

  const pick = (value) => (
    Array.isArray(value) && value.length >= graphs.length
      ? indices.map((index) => value[index])
      : value
  )

  return {
    ...snapshot,
    graph_predictions: pick(snapshot.graph_predictions),
    graph_confidences: pick(snapshot.graph_confidences),
    confidence_margins: pick(snapshot.confidence_margins),
    attention_entropy: pick(snapshot.attention_entropy),
    graph_structural_metrics: pick(snapshot.graph_structural_metrics),
    graph_correct: pick(snapshot.graph_correct),
    node_contributions: pick(snapshot.node_contributions),
    graph_probabilities: pick(snapshot.graph_probabilities),
  }
}
