import { describe, it, expect } from 'vitest'
import {
  buildConfusionMatrixK,
  buildClassDistribution,
  extractDirichletSeries,
  computeHomophilyScatter,
  computeBoundaryStats,
  computeAttentionFocus,
  buildTask1ModelSignature,
  summarizeTask1Split,
  assessTask1Reliability,
} from './task1Metrics'

describe('buildConfusionMatrixK', () => {
  it('returns K×K matrix with diagonal for perfect predictions', () => {
    const gt = [0, 1, 2, 0, 1, 2]
    const pr = [0, 1, 2, 0, 1, 2]
    const { matrix, numClasses, perClass } = buildConfusionMatrixK(gt, pr, 3)
    expect(numClasses).toBe(3)
    expect(matrix[0][0]).toBe(2)
    expect(matrix[1][1]).toBe(2)
    expect(matrix[2][2]).toBe(2)
    expect(matrix[0][1]).toBe(0)
    for (const pc of perClass) {
      expect(pc.precision).toBeCloseTo(1)
      expect(pc.recall).toBeCloseTo(1)
      expect(pc.f1).toBeCloseTo(1)
    }
  })

  it('counts off-diagonal misclassifications', () => {
    const gt = [0, 0, 1, 1]
    const pr = [0, 1, 1, 0]
    const { matrix, perClass } = buildConfusionMatrixK(gt, pr, 2)
    expect(matrix[0][0]).toBe(1)
    expect(matrix[0][1]).toBe(1)
    expect(matrix[1][0]).toBe(1)
    expect(matrix[1][1]).toBe(1)
    expect(perClass[0].precision).toBeCloseTo(0.5)
    expect(perClass[0].recall).toBeCloseTo(0.5)
    expect(perClass[0].f1).toBeCloseTo(0.5)
  })

  it('infers K when not supplied', () => {
    const { numClasses } = buildConfusionMatrixK([0, 1, 2, 2], [0, 1, 2, 2])
    expect(numClasses).toBe(3)
  })

  it('is resilient to invalid / out-of-range entries', () => {
    const { matrix } = buildConfusionMatrixK([0, 1, 9, null], [0, 1, 1, 0], 2)
    expect(matrix[0][0]).toBe(1)
    expect(matrix[1][1]).toBe(1)
    expect(matrix[0][1] + matrix[1][0]).toBe(0)
  })
})

describe('buildClassDistribution', () => {
  it('returns parallel counts per class', () => {
    const { gtCounts, predCounts } = buildClassDistribution([0, 0, 1], [0, 1, 1], 2)
    expect(gtCounts).toEqual([2, 1])
    expect(predCounts).toEqual([1, 2])
  })

  it('ignores entries outside [0, K)', () => {
    const { gtCounts } = buildClassDistribution([0, -1, 5, 1], [], 3)
    expect(gtCounts).toEqual([1, 1, 0])
  })
})

describe('extractDirichletSeries', () => {
  it('maps each snapshot dirichlet_energy into {epoch, energy}', () => {
    const snaps = [
      { dirichlet_energy: 0.8 },
      { dirichlet_energy: 0.4 },
      { dirichlet_energy: 0.1 },
    ]
    const s = extractDirichletSeries(snaps)
    expect(s.map((p) => p.epoch)).toEqual([0, 1, 2])
    expect(s.map((p) => p.energy)).toEqual([0.8, 0.4, 0.1])
  })

  it('coerces missing / invalid energies to 0', () => {
    const s = extractDirichletSeries([{}, { dirichlet_energy: 'nope' }, { dirichlet_energy: 0.3 }])
    expect(s.map((p) => p.energy)).toEqual([0, 0, 0.3])
  })
})

describe('computeHomophilyScatter', () => {
  it('zips majority_ratio with node_correctness', () => {
    const snap = {
      majority_ratio: [0.9, 0.3, 0.6],
      node_correctness: [1, 0, 1],
    }
    const points = computeHomophilyScatter(snap)
    expect(points).toEqual([
      { id: 0, ratio: 0.9, correct: 1 },
      { id: 1, ratio: 0.3, correct: 0 },
      { id: 2, ratio: 0.6, correct: 1 },
    ])
  })

  it('clamps ratios into [0, 1]', () => {
    const snap = { majority_ratio: [1.2, -0.1], node_correctness: [1, 0] }
    const [a, b] = computeHomophilyScatter(snap)
    expect(a.ratio).toBe(1)
    expect(b.ratio).toBe(0)
  })

  it('returns [] when fields are missing', () => {
    expect(computeHomophilyScatter(null)).toEqual([])
    expect(computeHomophilyScatter({})).toEqual([])
    expect(computeHomophilyScatter({ majority_ratio: [0.5] })).toEqual([])
  })
})

describe('computeBoundaryStats', () => {
  it('splits low-majority nodes into the boundary bucket', () => {
    const stats = computeBoundaryStats({
      majority_ratio: [0.2, 0.9, 0.4, 0.7],
      node_correctness: [0, 1, 1, 1],
      node_confidence: [0.3, 0.95, 0.6, 0.8],
    }, 0.5)

    expect(stats.boundaryCount).toBe(2)
    expect(stats.interiorCount).toBe(2)
    expect(stats.boundaryAccuracy).toBeCloseTo(0.5)
    expect(stats.interiorAccuracy).toBeCloseTo(1)
  })
})

describe('computeAttentionFocus', () => {
  it('returns concentration metrics from attention edges', () => {
    const focus = computeAttentionFocus({
      attention_edges: [
        { weight: 0.8 },
        { weight: 0.1 },
        { weight: 0.05 },
        { weight: 0.05 },
      ],
    })

    expect(focus.edgeCount).toBe(4)
    expect(focus.topEdgeShare).toBeGreaterThan(0.7)
    expect(focus.focus).toBeGreaterThan(0)
  })

  it('returns null when no attention data exists', () => {
    expect(computeAttentionFocus({})).toBeNull()
  })
})

describe('buildTask1ModelSignature', () => {
  it('builds a GCN signature from smoothing + neighborhood stats', () => {
    const signature = buildTask1ModelSignature({
      model: 'GCN',
      snapshot: {
        dirichlet_energy: 0.2,
        majority_ratio: [0.9, 0.8, 0.4],
        node_correctness: [1, 1, 0],
        node_confidence: [0.8, 0.7, 0.4],
      },
      snapshots: [{ dirichlet_energy: 1.0 }],
    })

    expect(signature.headline).toBe('Smoothing lens')
    expect(signature.secondaryValue).toBe('20%')
  })

  it('builds a GAT signature from attention concentration', () => {
    const signature = buildTask1ModelSignature({
      model: 'GAT',
      snapshot: {
        attention_edges: [{ weight: 0.8 }, { weight: 0.2 }],
        majority_ratio: [0.2, 0.9],
        node_correctness: [1, 1],
        node_confidence: [0.9, 0.7],
      },
      snapshots: [],
    })

    expect(signature.headline).toBe('Attention lens')
    expect(signature.primaryLabel).toBe('Focus score')
  })

  it('builds a GraphSAGE signature from boundary resilience', () => {
    const signature = buildTask1ModelSignature({
      model: 'SAGE',
      snapshot: {
        majority_ratio: [0.2, 0.4, 0.9],
        node_correctness: [1, 0, 1],
        node_confidence: [0.7, 0.4, 0.8],
      },
      snapshots: [],
    })

    expect(signature.headline).toBe('Neighborhood lens')
    expect(signature.primaryLabel).toBe('Boundary resilience')
  })
})

describe('summarizeTask1Split', () => {
  it('summarizes counts from graphData and masks', () => {
    const summary = summarizeTask1Split({
      graphData: {
        nodes: [
          { id: 0, groundTruth: 0 },
          { id: 1, groundTruth: 1 },
          { id: 2, groundTruth: 1 },
          { id: 3, groundTruth: 0 },
        ],
      },
      trainMask: [true, true, false, false],
      taskData: {
        valMask: [false, false, true, false],
        testMask: [false, false, false, true],
      },
    })

    expect(summary.totalNodes).toBe(4)
    expect(summary.trainCount).toBe(2)
    expect(summary.valCount).toBe(1)
    expect(summary.testCount).toBe(1)
    expect(summary.classTotals).toEqual([2, 2])
    expect(summary.trainClassCounts).toEqual([1, 1])
  })
})

describe('assessTask1Reliability', () => {
  it('flags tiny unstable evaluation on small graphs', () => {
    const result = assessTask1Reliability({
      datasetName: 'TinyGraph',
      graphData: {
        nodes: Array.from({ length: 12 }, (_, i) => ({
          id: i,
          groundTruth: i < 6 ? 0 : 1,
          inTrainSet: i < 8,
        })),
      },
      trainMask: Array.from({ length: 12 }, (_, i) => i < 8),
      snapshots: [
        { val_acc: 0.8 },
        { val_acc: 0.55 },
        { val_acc: 0.75 },
      ],
      snapshot: {
        node_predictions: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
        train_acc: 0.95,
        val_acc: 0.55,
        train_loss: 0.04,
        node_confidence: Array.from({ length: 12 }, () => 0.9),
        majority_ratio: Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 0.3 : 0.8)),
        node_correctness: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
      },
    })

    expect(result.status).toBe('danger')
    expect(result.warnings.map((item) => item.code)).toContain('small_graph')
    expect(result.warnings.map((item) => item.code)).toContain('tiny_eval_split')
    expect(result.warnings.map((item) => item.code)).toContain('possible_memorization')
  })

  it('stays healthy for larger stable datasets', () => {
    const graphData = {
      nodes: Array.from({ length: 300 }, (_, i) => ({
        id: i,
        groundTruth: i % 3,
        inTrainSet: i < 180,
      })),
    }
    const snapshot = {
      node_predictions: Array.from({ length: 300 }, (_, i) => i % 3),
      train_acc: 0.86,
      val_acc: 0.8,
      train_loss: 0.22,
      node_confidence: Array.from({ length: 300 }, () => 0.74),
      majority_ratio: Array.from({ length: 300 }, () => 0.72),
      node_correctness: Array.from({ length: 300 }, () => 1),
    }
    const result = assessTask1Reliability({
      datasetName: 'CoraLike',
      graphData,
      trainMask: Array.from({ length: 300 }, (_, i) => i < 180),
      snapshots: [{ val_acc: 0.79 }, { val_acc: 0.8 }, { val_acc: 0.81 }],
      snapshot,
    })

    expect(result.status).toBe('healthy')
    expect(result.warnings).toHaveLength(0)
  })
})
