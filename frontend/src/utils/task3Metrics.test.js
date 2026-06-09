import { describe, it, expect } from 'vitest'
import {
  pairScores,
  buildROCPoints,
  buildPRPoints,
  topKHardEdges,
  brierScore,
  buildCalibrationBins,
  buildScoreHistogram,
  accuracyAtThreshold,
  hitsAtK,
  precisionAtK,
  recallAtK,
} from './task3Metrics.js'

const scores = [0.9, 0.2, 0.7, 0.1, 0.85, 0.4, 0.6, 0.05]
const testEdges = [
  { source: 0, target: 1, exists: true },
  { source: 0, target: 2, exists: false },
  { source: 1, target: 2, exists: true },
  { source: 2, target: 3, exists: false },
  { source: 3, target: 4, exists: false }, // <- easy false positive (score 0.85)
  { source: 4, target: 5, exists: false },
  { source: 5, target: 6, exists: true }, // <- score 0.6, positive
  { source: 6, target: 7, exists: true }, // <- hard false negative (score 0.05)
]

describe('pairScores', () => {
  it('returns empty when inputs missing', () => {
    expect(pairScores(null, null)).toEqual([])
    expect(pairScores([], [])).toEqual([])
  })
  it('sorts by score descending and preserves source/target', () => {
    const paired = pairScores(scores, testEdges)
    expect(paired).toHaveLength(8)
    expect(paired[0].score).toBe(0.9)
    expect(paired.at(-1).score).toBe(0.05)
    expect(paired[0]).toMatchObject({ source: 0, target: 1, y: 1 })
  })
})

describe('buildROCPoints', () => {
  it('returns diagonal fallback when degenerate', () => {
    const { points, auc } = buildROCPoints([])
    expect(auc).toBeCloseTo(0.5)
    expect(points.at(-1)).toEqual({ fpr: 1, tpr: 1 })
  })
  it('is monotone non-decreasing and AUC in [0,1]', () => {
    const paired = pairScores(scores, testEdges)
    const { points, auc } = buildROCPoints(paired)
    expect(points.at(-1)).toMatchObject({ fpr: 1, tpr: 1 })
    for (let i = 1; i < points.length; i++) {
      expect(points[i].fpr).toBeGreaterThanOrEqual(points[i - 1].fpr)
      expect(points[i].tpr).toBeGreaterThanOrEqual(points[i - 1].tpr)
    }
    expect(auc).toBeGreaterThan(0)
    expect(auc).toBeLessThanOrEqual(1)
  })
})

describe('buildPRPoints', () => {
  it('returns empty points when no positives', () => {
    const paired = pairScores([0.9, 0.8], [{ exists: false }, { exists: false }])
    expect(buildPRPoints(paired).points).toEqual([])
  })
  it('precision starts high and AP is bounded', () => {
    const paired = pairScores(scores, testEdges)
    const { points, ap } = buildPRPoints(paired)
    expect(points[0].precision).toBeGreaterThanOrEqual(0)
    expect(points.at(-1).recall).toBeCloseTo(1, 6)
    expect(ap).toBeGreaterThan(0)
    expect(ap).toBeLessThanOrEqual(1)
  })
})

describe('topKHardEdges', () => {
  it('picks highest-score FP and lowest-score FN', () => {
    const paired = pairScores(scores, testEdges)
    const { falsePositives, falseNegatives } = topKHardEdges(paired, 3)
    expect(falsePositives[0].score).toBe(0.85)
    expect(falsePositives[0].y).toBe(0)
    expect(falseNegatives[0].score).toBe(0.05)
    expect(falseNegatives[0].y).toBe(1)
  })
  it('respects k cap', () => {
    const paired = pairScores(scores, testEdges)
    const { falsePositives } = topKHardEdges(paired, 1)
    expect(falsePositives).toHaveLength(1)
  })
})

describe('buildScoreHistogram', () => {
  it('totals equal input length', () => {
    const paired = pairScores(scores, testEdges)
    const bins = buildScoreHistogram(paired, 10)
    expect(bins).toHaveLength(10)
    const total = bins.reduce((a, b) => a + b.positive + b.negative, 0)
    expect(total).toBe(8)
  })
})

describe('accuracyAtThreshold', () => {
  it('returns 0 when empty', () => {
    expect(accuracyAtThreshold([])).toBe(0)
  })
  it('is in [0,1]', () => {
    const paired = pairScores(scores, testEdges)
    const acc = accuracyAtThreshold(paired, 0.5)
    expect(acc).toBeGreaterThanOrEqual(0)
    expect(acc).toBeLessThanOrEqual(1)
  })
})

describe('ranking helpers', () => {
  it('computes precision, recall, and hits at k from sorted pairs', () => {
    const paired = pairScores(scores, testEdges)
    expect(precisionAtK(paired, 3)).toBeCloseTo(2 / 3, 6)
    expect(recallAtK(paired, 3)).toBeCloseTo(0.5, 6)
    expect(hitsAtK(paired, 1)).toBe(1)
  })

  it('returns zeros for degenerate inputs', () => {
    expect(precisionAtK([], 3)).toBe(0)
    expect(recallAtK([], 3)).toBe(0)
    expect(hitsAtK([], 3)).toBe(0)
  })
})

describe('calibration helpers', () => {
  it('computes a bounded brier score', () => {
    const paired = pairScores(scores, testEdges)
    const value = brierScore(paired)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(1)
  })

  it('builds calibration bins whose counts match the input size', () => {
    const paired = pairScores(scores, testEdges)
    const bins = buildCalibrationBins(paired, 4)
    expect(bins).toHaveLength(4)
    const total = bins.reduce((sum, row) => sum + row.count, 0)
    expect(total).toBe(paired.length)
    expect(bins.some((row) => row.count > 0 && row.avgConfidence >= 0)).toBe(true)
  })
})
