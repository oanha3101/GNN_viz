import { describe, it, expect } from 'vitest'
import {
  buildConfusionMatrix,
  computeMargins,
  computeHardCases,
  buildConfidenceHistogram,
  computeEntropy,
  buildDiagnosticsPoints,
  summarizeGraphCollection,
  assessTask2Reliability,
  buildTask2FocusBuckets,
  filterTask2Snapshot,
  bucketTask2Density,
  bucketTask2Entropy,
  bucketTask2Clustering,
  bucketTask2ReadoutConcentration,
  computeTask2ReadoutConcentration,
  buildTask2GraphDescriptors,
  filterTask2DescriptorsByCell,
  sortTask2Descriptors,
  buildTask2NarrativeSummary,
  buildTask2ResearchSignals,
  buildTask2BestEpochSuggestion,
  buildTask2FocusStory,
} from './task2Metrics'

describe('buildConfusionMatrix', () => {
  it('returns zero matrix on empty input', () => {
    const cm = buildConfusionMatrix([], [], 2)
    expect(cm.matrix).toEqual([[0, 0], [0, 0]])
    expect(cm.accuracy).toBe(0)
  })

  it('counts 2x2 correctly and derives precision/recall', () => {
    // preds = [0,0,1,1,1], truth = [0,1,1,1,0]  -> 3 correct
    const cm = buildConfusionMatrix([0, 0, 1, 1, 1], [0, 1, 1, 1, 0], 2)
    expect(cm.matrix[0][0]).toBe(1) // TP class 0
    expect(cm.matrix[0][1]).toBe(1) // pred 0 but actual 1
    expect(cm.matrix[1][1]).toBe(2) // TP class 1
    expect(cm.matrix[1][0]).toBe(1) // FP class 1
    expect(cm.accuracy).toBeCloseTo(3 / 5)
    expect(cm.precision[0]).toBeCloseTo(0.5)
    expect(cm.recall[0]).toBeCloseTo(0.5)
  })

  it('infers numClasses when omitted', () => {
    const cm = buildConfusionMatrix([0, 2, 1], [0, 2, 1])
    expect(cm.classes).toBe(3)
    expect(cm.accuracy).toBe(1)
  })
})

describe('computeMargins', () => {
  it('returns top1-top2 gap', () => {
    const m = computeMargins([[0.7, 0.3], [0.4, 0.6], [0.5, 0.5]])
    expect(m[0]).toBeCloseTo(0.4)
    expect(m[1]).toBeCloseTo(0.2)
    expect(m[2]).toBeCloseTo(0)
  })

  it('handles single-class gracefully', () => {
    expect(computeMargins([[0.9]])[0]).toBeCloseTo(0.9)
  })
})

describe('computeHardCases', () => {
  const graphs = [
    { groundTruth: 0, nodes: [1, 2, 3], links: [{}] },
    { groundTruth: 1, nodes: [1, 2], links: [] },
    { groundTruth: 0, nodes: [1, 2, 3, 4], links: [{}, {}] },
  ]
  const snap = {
    graph_predictions: [0, 0, 0], // #1 wrong (gt=1), #2 correct via coincidence
    graph_confidences: [0.9, 0.4, 0.6],
    confidence_margins: [0.8, 0.05, 0.2],
  }

  it('puts wrong predictions before correct ones', () => {
    const hc = computeHardCases(snap, graphs, 3)
    expect(hc[0].correct).toBe(false)
    expect(hc[0].id).toBe(1)
  })

  it('uses originalGraphId when present', () => {
    const taggedGraphs = graphs.map((graph, index) => ({ ...graph, originalGraphId: index + 10 }))
    const hc = computeHardCases(snap, taggedGraphs, 3)
    expect(hc[0].id).toBe(11)
  })

  it('respects onlyWrong filter', () => {
    const hc = computeHardCases(snap, graphs, 5, { onlyWrong: true })
    expect(hc.length).toBe(1)
    expect(hc[0].id).toBe(1)
  })

  it('sorts correct cases by ascending margin', () => {
    const hc = computeHardCases(snap, graphs, 10)
    const correctOnes = hc.filter((x) => x.correct)
    expect(correctOnes[0].margin).toBeLessThanOrEqual(correctOnes[1].margin)
  })
})

describe('buildConfidenceHistogram', () => {
  it('buckets confidences into bins', () => {
    const snap = {
      graph_confidences: [0.05, 0.15, 0.5, 0.95, 0.99],
      graph_correct: [1, 0, 1, 1, 1],
    }
    const h = buildConfidenceHistogram(snap, 10)
    expect(h[0].count).toBe(1) // 0.05
    expect(h[1].count).toBe(1) // 0.15
    expect(h[5].count).toBe(1) // 0.5
    expect(h[9].count).toBe(2) // 0.95, 0.99
    expect(h[9].correct).toBe(2)
    expect(h[1].wrong).toBe(1)
  })
})

describe('computeEntropy', () => {
  it('returns 1 for uniform distribution', () => {
    expect(computeEntropy([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(1)
  })
  it('returns 0 for spike distribution', () => {
    expect(computeEntropy([1, 0, 0, 0])).toBeCloseTo(0)
  })
  it('returns 0 on empty / all zero', () => {
    expect(computeEntropy([])).toBe(0)
    expect(computeEntropy([0, 0, 0])).toBe(0)
  })
})

describe('buildDiagnosticsPoints', () => {
  it('zips snapshot fields per graph', () => {
    const snap = {
      attention_entropy: [0.1, 0.8],
      graph_structural_metrics: [
        { density: 0.3, avg_clustering: 0.2, avg_degree: 2.0 },
        { density: 0.7, avg_clustering: 0.5, avg_degree: 3.5 },
      ],
      graph_correct: [1, 0],
    }
    const graphs = [
      { groundTruth: 0 },
      { groundTruth: 1 },
    ]
    const pts = buildDiagnosticsPoints(snap, graphs)
    expect(pts).toHaveLength(2)
    expect(pts[0].entropy).toBeCloseTo(0.1)
    expect(pts[1].density).toBeCloseTo(0.7)
    expect(pts[0].correct).toBe(true)
  })

  it('preserves original graph id when available', () => {
    const snap = {
      attention_entropy: [0.2],
      graph_structural_metrics: [{ density: 0.5, avg_clustering: 0.4, avg_degree: 2.5 }],
      graph_correct: [1],
    }
    const pts = buildDiagnosticsPoints(snap, [{ originalGraphId: 42, groundTruth: 0 }])
    expect(pts[0].id).toBe(42)
  })

  it('falls back to computeEntropy when attention_entropy is missing', () => {
    const snap = {
      node_contributions: [[1, 0, 0], [0.25, 0.25, 0.25, 0.25]],
      graph_correct: [1, 1],
    }
    const graphs = [{}, {}]
    const pts = buildDiagnosticsPoints(snap, graphs)
    expect(pts[0].entropy).toBeCloseTo(0)
    expect(pts[1].entropy).toBeCloseTo(1)
  })
})

describe('task 2 collection helpers', () => {
  const graphs = [
    { originalGraphId: 10, groundTruth: 0, nodes: [1, 2, 3], links: [{}, {}] },
    { originalGraphId: 11, groundTruth: 1, nodes: [1, 2], links: [{}] },
    { originalGraphId: 12, groundTruth: 1, nodes: [1, 2, 3, 4], links: [{}, {}, {}] },
    { originalGraphId: 13, groundTruth: 2, nodes: [1, 2, 3], links: [] },
  ]
    const snapshot = {
      graph_predictions: [0, 0, 1, 2],
      graph_confidences: [0.92, 0.88, 0.58, 0.67],
      confidence_margins: [0.8, 0.04, 0.09, 0.22],
      attention_entropy: [0.2, 0.91, 0.82, 0.3],
    graph_structural_metrics: [
      { density: 0.1, avg_clustering: 0.1 },
      { density: 0.72, avg_clustering: 0.78 },
      { density: 0.68, avg_clustering: 0.74 },
      { density: 0.15, avg_clustering: 0.12 },
      ],
      graph_correct: [1, 0, 1, 1],
      node_contributions: [[1, 0], [0.3, 0.3, 0.4], [0.4, 0.4, 0.2], [1, 0, 0]],
      graph_per_class_metrics: [
        { class_id: 0, support: 1, precision: 1, recall: 1, f1: 1, mean_confidence: 0.92 },
        { class_id: 1, support: 2, precision: 0.5, recall: 0.5, f1: 0.5, mean_confidence: 0.73 },
        { class_id: 2, support: 1, precision: 1, recall: 1, f1: 1, mean_confidence: 0.67 },
      ],
      graph_calibration: { ece: 0.14, bins: [] },
      readout_quality: { mean_entropy: 0.56, diffuse_share: 0.5, concentrated_share: 0.25 },
      trust_profile: {
        brier: 0.23,
        high_conf_wrong_rate: 0.25,
        shortcut_risk_score: 0.42,
        readout_diffuse_share: 0.5,
        calibration_temperature: 1.3,
      },
      structural_bias_signals: {
        confidence_vs_density: 0.42,
        confidence_vs_num_nodes: 0.31,
        shortcut_risk_score: 0.42,
      },
    }

  it('summarizes graph collection size and class counts', () => {
    const summary = summarizeGraphCollection(graphs, ['A', 'B', 'C'])
    expect(summary.totalGraphs).toBe(4)
    expect(summary.totalNodes).toBe(12)
    expect(summary.classCounts[1]).toEqual(expect.objectContaining({ label: 'B', support: 2 }))
  })

  it('flags reliability risks for small or skewed collections', () => {
      const reliability = assessTask2Reliability({ snapshot, graphs, classNames: ['A', 'B', 'C'] })
      expect(reliability.status).not.toBe('ok')
      expect(reliability.warnings.length).toBeGreaterThan(0)
      expect(reliability.metrics.macroF1).toBeGreaterThanOrEqual(0)
      expect(reliability.metrics.balancedAccuracy).toBeGreaterThanOrEqual(0)
      expect(reliability.metrics.calibrationEce).toBe(0.14)
      expect(reliability.metrics.brier).toBe(0.23)
      expect(reliability.metrics.highConfWrongRate).toBe(0.25)
      expect(reliability.metrics.shortcutRiskScore).toBe(0.42)
      expect(reliability.metrics.readoutDiffuseShare).toBe(0.5)
      expect(reliability.metrics.perClass).toHaveLength(3)
      expect(reliability.metrics.weakClass).toEqual(expect.objectContaining({ classId: expect.any(Number) }))
    })

  it('builds smart focus buckets', () => {
    const buckets = buildTask2FocusBuckets({ snapshot, graphs, classNames: ['A', 'B', 'C'] })
    const failures = buckets.find((bucket) => bucket.id === 'failures')
    const weakClass = buckets.find((bucket) => bucket.id === 'weak_class')
    const diffuse = buckets.find((bucket) => bucket.id === 'diffuse')
    expect(failures.graphIds).toContain(11)
    expect(weakClass).toBeTruthy()
    expect(diffuse.graphIds).toContain(11)
  })

  it('filters graph-level snapshot arrays by original graph ids', () => {
    const filtered = filterTask2Snapshot(snapshot, [11, 13], graphs)
    expect(filtered.graph_predictions).toEqual([0, 2])
    expect(filtered.graph_correct).toEqual([0, 1])
    expect(filtered.node_contributions).toHaveLength(2)
  })

  it('builds task 2 graph descriptors with buckets and narrative tags', () => {
    const descriptors = buildTask2GraphDescriptors({ snapshot, graphs, classNames: ['A', 'B', 'C'] })
    expect(descriptors[0]).toEqual(expect.objectContaining({
      originalGraphId: 10,
      sourceIndex: 0,
      densityBucket: 'sparse',
      entropyBucket: 'concentrated',
      clusteringBucket: 'low',
      readoutConcentration: expect.any(Number),
      motifSignature: expect.any(String),
      failureTag: expect.any(String),
    }))
  })

  it('buckets density, entropy, clustering, and readout concentration', () => {
    expect(bucketTask2Density(0.1)).toBe('sparse')
    expect(bucketTask2Density(0.3)).toBe('medium')
    expect(bucketTask2Density(0.7)).toBe('dense')
    expect(bucketTask2Entropy(0.2)).toBe('concentrated')
    expect(bucketTask2Entropy(0.5)).toBe('balanced')
    expect(bucketTask2Entropy(0.9)).toBe('diffuse')
    expect(bucketTask2Clustering(0.1)).toBe('low')
    expect(bucketTask2Clustering(0.4)).toBe('medium')
    expect(bucketTask2Clustering(0.7)).toBe('high')
    expect(bucketTask2ReadoutConcentration(0.2)).toBe('diffuse')
    expect(bucketTask2ReadoutConcentration(0.5)).toBe('mixed')
    expect(bucketTask2ReadoutConcentration(0.9)).toBe('concentrated')
  })

  it('computes readout concentration from node contributions', () => {
    const result = computeTask2ReadoutConcentration([0.9, 0.7, 0.6, 0.1])
    expect(result.score).toBeGreaterThan(0)
    expect(result.topContributors).toHaveLength(3)
  })

  it('filters descriptors by confusion cell and sorts by priority', () => {
    const descriptors = buildTask2GraphDescriptors({ snapshot, graphs, classNames: ['A', 'B', 'C'] })
    const filtered = filterTask2DescriptorsByCell(descriptors, { pred: 0, gt: 1 })
    expect(filtered.every((item) => item.predicted === 0 && item.groundTruth === 1)).toBe(true)
    const sorted = sortTask2Descriptors(descriptors, 'priority')
    expect(sorted[0].correct).toBe(0)
  })

  it('builds a narrative summary for task 2 slice', () => {
    const descriptors = buildTask2GraphDescriptors({ snapshot, graphs, classNames: ['A', 'B', 'C'] })
    const summary = buildTask2NarrativeSummary(descriptors, assessTask2Reliability({ snapshot, graphs, classNames: ['A', 'B', 'C'] }))
    expect(summary.mainInsight).toEqual(expect.any(String))
    expect(summary.mainRisk).toEqual(expect.any(String))
    expect(summary.recommendedNextLens).toEqual(expect.any(String))
  })

  it('builds research signals for collapse, calibration, and shortcut bias', () => {
    const descriptors = buildTask2GraphDescriptors({ snapshot, graphs, classNames: ['A', 'B', 'C'] })
    const reliability = assessTask2Reliability({ snapshot, graphs, classNames: ['A', 'B', 'C'] })
    const signals = buildTask2ResearchSignals({
      snapshot,
      graphs,
      classNames: ['A', 'B', 'C'],
      reliability,
      descriptors,
    })
    expect(signals.collapse).toEqual(expect.objectContaining({
      title: 'Class collapse',
      summary: expect.any(String),
      recommendation: expect.any(String),
    }))
    expect(signals.calibration).toEqual(expect.objectContaining({
      title: 'Calibration',
      evidence: expect.any(String),
    }))
    expect(signals.shortcut).toEqual(expect.objectContaining({
      title: 'Shortcut bias',
      status: expect.any(String),
    }))
  })

  it('suggests a best epoch using Macro F1 and Balanced Acc', () => {
    const suggestion = buildTask2BestEpochSuggestion([
      { epoch: 0, macro_f1: 0.52, balanced_accuracy: 0.55, val_acc: 0.7 },
      { epoch: 1, macro_f1: 0.68, balanced_accuracy: 0.63, val_acc: 0.74 },
      { epoch: 2, macro_f1: 0.64, balanced_accuracy: 0.71, val_acc: 0.73 },
    ])

    expect(suggestion.bestMacro.epoch).toBe(1)
    expect(suggestion.bestBalanced.epoch).toBe(2)
    expect(suggestion.recommendation).toContain('epoch 1')
  })

  it('builds a focus story linking density shortcut and weak-class misses', () => {
    const descriptors = buildTask2GraphDescriptors({ snapshot, graphs, classNames: ['A', 'B', 'C'] })
    const reliability = assessTask2Reliability({ snapshot, graphs, classNames: ['A', 'B', 'C'] })
    const story = buildTask2FocusStory({
      reliability,
      descriptors,
      classNames: ['A', 'B', 'C'],
    })

    expect(story).toEqual(expect.objectContaining({
      title: 'Density shortcut vs weak-class misses',
      weakClassFocusId: 'weak_class',
      structureFocusId: 'outlier',
    }))
  })
})
