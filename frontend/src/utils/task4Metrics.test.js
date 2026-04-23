import { describe, it, expect } from 'vitest'
import {
  buildBridgeRanking,
  buildStabilityMatrix,
  buildClusterConfidenceHistogram,
  normalizeCommunityCenters,
  computeAggregateStability,
} from './task4Metrics'

describe('buildBridgeRanking', () => {
  it('returns top-K ordered by bridge_strength desc', () => {
    const snap = {
      bridge_nodes: [false, true, true, true, false],
      bridge_strength: [0, 0.3, 0.9, 0.6, 0],
      node_predictions: [0, 0, 1, 1, 0],
    }
    const res = buildBridgeRanking(snap, 2)
    expect(res).toEqual([
      { id: 2, strength: 0.9, community: 1 },
      { id: 3, strength: 0.6, community: 1 },
    ])
  })

  it('falls back to strength=1 when bridge_strength is absent but flag is true', () => {
    const snap = { bridge_nodes: [false, true, true] }
    const res = buildBridgeRanking(snap, 10)
    expect(res).toHaveLength(2)
    expect(res.every((r) => r.strength === 1)).toBe(true)
  })

  it('returns [] for empty snap', () => {
    expect(buildBridgeRanking(null)).toEqual([])
    expect(buildBridgeRanking({})).toEqual([])
  })
})

describe('buildStabilityMatrix', () => {
  it('first epoch is 1.0 (no previous reference)', () => {
    const snaps = [{ node_predictions: [0, 0, 1, 1] }]
    const { matrix, numCommunities, epochAverages } = buildStabilityMatrix(snaps)
    expect(numCommunities).toBe(2)
    expect(epochAverages[0]).toBe(1)
    expect(matrix[0][0]).toBe(1)
    expect(matrix[1][0]).toBe(1)
  })

  it('computes per-community stability across 3 epochs', () => {
    const snaps = [
      { node_predictions: [0, 0, 1, 1] },
      { node_predictions: [0, 1, 1, 1] }, // 1 of 2 C0 nodes stayed
      { node_predictions: [0, 1, 1, 0] }, // 1 of 3 C1 nodes switched
    ]
    const res = buildStabilityMatrix(snaps, 2)
    // epoch 1: C0 stayed 1/2 = 0.5; C1 stayed 2/2 = 1
    expect(res.matrix[0][1]).toBeCloseTo(0.5)
    expect(res.matrix[1][1]).toBe(1)
    // overall epoch 1: 3/4 stayed
    expect(res.epochAverages[1]).toBeCloseTo(0.75)
  })

  it('empty snapshots return empty matrix', () => {
    const res = buildStabilityMatrix([])
    expect(res.matrix).toEqual([])
    expect(res.numEpochs).toBe(0)
  })
})

describe('buildClusterConfidenceHistogram', () => {
  it('buckets values into bins', () => {
    const snap = { cluster_confidence: [0.05, 0.15, 0.95, 0.99, 0.5] }
    const hist = buildClusterConfidenceHistogram(snap, 10)
    expect(hist).toHaveLength(10)
    expect(hist[0].count).toBe(1) // 0.05
    expect(hist[1].count).toBe(1) // 0.15
    expect(hist[5].count).toBe(1) // 0.5
    expect(hist[9].count).toBe(2) // 0.95, 0.99
  })

  it('empty input produces bins of count 0', () => {
    const hist = buildClusterConfidenceHistogram({}, 5)
    expect(hist.every((b) => b.count === 0)).toBe(true)
  })
})

describe('normalizeCommunityCenters', () => {
  it('scales anchors by min(width,height)/reference', () => {
    const anchors = [
      { x: -220, y: -150 },
      { x: 220, y: 150 },
    ]
    const out = normalizeCommunityCenters(anchors, 300, 300, 600)
    expect(out[0].x).toBeCloseTo(-110)
    expect(out[0].y).toBeCloseTo(-75)
    expect(out[1].x).toBeCloseTo(110)
  })

  it('no anchors → empty array', () => {
    expect(normalizeCommunityCenters()).toEqual([])
  })
})

describe('computeAggregateStability', () => {
  it('averages across epochs excluding epoch 0', () => {
    const mat = { epochAverages: [1, 0.8, 0.9], numEpochs: 3 }
    expect(computeAggregateStability(mat)).toBeCloseTo(0.85)
  })

  it('returns 1 for 0- or 1-epoch histories', () => {
    expect(computeAggregateStability({ epochAverages: [1], numEpochs: 1 })).toBe(1)
    expect(computeAggregateStability({ epochAverages: [], numEpochs: 0 })).toBe(1)
  })
})
