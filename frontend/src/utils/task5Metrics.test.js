import { describe, it, expect } from 'vitest'
import {
  topKOutliers,
  buildNormHistogram,
  computeIsotropy,
  buildKnnScatter,
} from './task5Metrics'

describe('topKOutliers', () => {
  it('returns sorted top-K by score desc with node ids', () => {
    const scores = [0.1, 0.9, 0.4, 0.7, 0.2]
    const out = topKOutliers(scores, 3)
    expect(out.map((r) => r.id)).toEqual([1, 3, 2])
    expect(out.map((r) => r.score)).toEqual([0.9, 0.7, 0.4])
  })

  it('handles empty / null input', () => {
    expect(topKOutliers([], 5)).toEqual([])
    expect(topKOutliers(null, 5)).toEqual([])
    expect(topKOutliers(undefined, 5)).toEqual([])
  })

  it('clamps k to scores.length', () => {
    expect(topKOutliers([0.5, 0.6], 10)).toHaveLength(2)
  })

  it('skips NaN / undefined entries', () => {
    const scores = [0.3, NaN, undefined, 0.9, 0.5]
    const out = topKOutliers(scores, 3)
    expect(out.map((r) => r.id)).toEqual([3, 4, 0])
  })

  it('accepts backend object rows', () => {
    const out = topKOutliers([
      { node_id: 4, avg_distance_to_neighbors: 0.2, is_outlier: false },
      { node_id: 7, avg_distance_to_neighbors: 0.9, is_outlier: true },
    ])
    expect(out.map((r) => r.id)).toEqual([7, 4])
    expect(out[0].score).toBeCloseTo(0.9)
    expect(out[0].isOutlier).toBe(true)
  })
})

describe('buildNormHistogram', () => {
  it('builds `bins` buckets covering [min, max]', () => {
    const norms = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const bins = buildNormHistogram(norms, 5)
    expect(bins).toHaveLength(5)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(10)
  })

  it('handles all-same norms without crashing', () => {
    const bins = buildNormHistogram([3, 3, 3, 3], 4)
    expect(bins).toHaveLength(4)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(4)
  })

  it('returns [] for empty input', () => {
    expect(buildNormHistogram([], 5)).toEqual([])
    expect(buildNormHistogram(null, 5)).toEqual([])
  })

  it('clamps bins to a minimum of 1', () => {
    const bins = buildNormHistogram([1, 2, 3], 0)
    expect(bins.length).toBeGreaterThanOrEqual(1)
  })
})

describe('computeIsotropy', () => {
  it('returns ~1 for perfectly isotropic embeddings (uniform on circle)', () => {
    const emb = Array.from({ length: 24 }, (_, i) => {
      const t = (i / 24) * 2 * Math.PI
      return [Math.cos(t), Math.sin(t)]
    })
    const iso = computeIsotropy(emb)
    expect(iso).toBeGreaterThan(0.8)
  })

  it('returns low score for degenerate embeddings (all same point)', () => {
    const emb = Array.from({ length: 10 }, () => [1, 0])
    const iso = computeIsotropy(emb)
    expect(iso).toBeLessThanOrEqual(0.5)
  })

  it('returns 0 for empty / malformed input', () => {
    expect(computeIsotropy([])).toBe(0)
    expect(computeIsotropy(null)).toBe(0)
  })
})

describe('buildKnnScatter', () => {
  it('pairs degree and knn score per node', () => {
    const degrees = [2, 5, 3]
    const knn = [0.4, 0.9, 0.6]
    const pts = buildKnnScatter(degrees, knn)
    expect(pts).toEqual([
      { id: 0, degree: 2, knn: 0.4 },
      { id: 1, degree: 5, knn: 0.9 },
      { id: 2, degree: 3, knn: 0.6 },
    ])
  })

  it('skips nodes with missing scores', () => {
    const pts = buildKnnScatter([2, 5, 3], [0.4, undefined, 0.6])
    expect(pts.map((p) => p.id)).toEqual([0, 2])
  })

  it('accepts backend object maps keyed by node id', () => {
    const pts = buildKnnScatter([2, 5, 3], { 0: 0.4, 2: 0.6 })
    expect(pts).toEqual([
      { id: 0, degree: 2, knn: 0.4 },
      { id: 2, degree: 3, knn: 0.6 },
    ])
  })

  it('returns [] on empty input', () => {
    expect(buildKnnScatter([], [])).toEqual([])
    expect(buildKnnScatter(null, null)).toEqual([])
  })
})
