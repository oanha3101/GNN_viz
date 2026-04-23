import { describe, it, expect } from 'vitest'
import {
  buildConfusionMatrixK,
  buildClassDistribution,
  extractDirichletSeries,
  computeHomophilyScatter,
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
