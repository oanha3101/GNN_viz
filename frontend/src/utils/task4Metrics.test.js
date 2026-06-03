import { describe, it, expect } from 'vitest'
import {
  buildBridgeRanking,
  buildStabilityMatrix,
  buildClusterConfidenceHistogram,
  normalizeCommunityCenters,
  computeAggregateStability,
  buildTask4QualitySummary,
  buildTask4NodeProfile,
  getTask4OverlayMode,
  buildTask4MotionProfile,
  buildTask4DendrogramRows,
  buildTask4ReasoningPack,
  buildTask4ReasoningHighlights,
  buildCoreCommunityEnvelopes,
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

  it('supports signed confidence values from Task 4 backend', () => {
    const hist = buildClusterConfidenceHistogram({ cluster_confidence: [-0.8, -0.1, 0.2, 0.9] }, 4)

    expect(hist[0].range[0]).toBe(-1)
    expect(hist.reduce((sum, bin) => sum + bin.count, 0)).toBe(4)
  })
})

describe('buildTask4QualitySummary', () => {
  it('prefers backend aggregate fields when present', () => {
    const summary = buildTask4QualitySummary({
      modularity_q: 0.42,
      conductance: 0.18,
      mean_silhouette: 0.31,
      mean_cluster_confidence: 0.77,
      bridge_ratio: 0.12,
      largest_community_ratio: 0.45,
      empty_community_count: 1,
    })

    expect(summary).toEqual({
      modularity: 0.42,
      conductance: 0.18,
      silhouette: 0.31,
      confidence: 0.77,
      bridgeRatio: 0.12,
      largestCommunityRatio: 0.45,
      emptyCommunityCount: 1,
      healthScore: expect.any(Number),
    })
    expect(summary.healthScore).toBeGreaterThan(0)
  })

  it('derives aggregate fields from legacy snapshots', () => {
    const summary = buildTask4QualitySummary({
      modularity_q: 0.5,
      conductance: 0.2,
      silhouette_scores: [0.2, 0.4],
      cluster_confidence: [0.6, 0.8],
      bridge_nodes: [true, false, true, false],
      community_sizes: [2, 1, 1, 0],
    })

    expect(summary.silhouette).toBeCloseTo(0.3)
    expect(summary.confidence).toBeCloseTo(0.7)
    expect(summary.bridgeRatio).toBeCloseTo(0.5)
    expect(summary.largestCommunityRatio).toBeCloseTo(0.5)
    expect(summary.emptyCommunityCount).toBe(1)
  })
})

describe('buildTask4NodeProfile', () => {
  const graphData = {
    nodes: [{ id: 0, degree: 2 }, { id: 1, degree: 3 }, { id: 2, degree: 1 }],
    links: [{ source: 0, target: 1 }, { source: 1, target: 2 }],
  }

  it('builds a node-level community explanation from live Task 4 snapshot fields', () => {
    const profile = buildTask4NodeProfile({
      snap: {
        node_predictions_aligned: [0, 1, 1],
        bridge_nodes: [false, true, false],
        bridge_strength: [0, 0.75, 0],
        silhouette_scores: [0.2, 0.4, 0.8],
        cluster_confidence: [0.6, 0.9, 0.7],
        local_smoothness: [0.1, 0.2, 0.3],
      },
      prevSnap: { node_predictions_aligned: [0, 0, 1] },
      nodeId: 1,
      graphData,
    })

    expect(profile).toMatchObject({
      id: 1,
      degree: 3,
      community: 1,
      previousCommunity: 0,
      migrated: true,
      isBridge: true,
      bridgeStrength: 0.75,
      silhouette: 0.4,
      confidence: 0.9,
      localSmoothness: 0.2,
      sameCommunityNeighbors: 1,
      crossCommunityNeighbors: 1,
    })
  })

  it('supports legacy bridge node id arrays', () => {
    const profile = buildTask4NodeProfile({
      snap: {
        node_predictions: [0, 1],
        bridge_nodes: [1],
      },
      nodeId: 1,
      graphData: { nodes: [{ id: 1 }], links: [] },
    })

    expect(profile.isBridge).toBe(true)
    expect(profile.bridgeStrength).toBe(1)
  })
})

describe('getTask4OverlayMode', () => {
  it('maps model names to the right visualization overlay', () => {
    expect(getTask4OverlayMode('GAT')).toBe('attention')
    expect(getTask4OverlayMode('GCN')).toBe('smoothness')
    expect(getTask4OverlayMode('GraphSAGE')).toBe('migration')
    expect(getTask4OverlayMode('SAGE')).toBe('migration')
  })
})

describe('buildTask4MotionProfile', () => {
  it('uses a soft cinematic profile for normal Task 4 graphs', () => {
    const profile = buildTask4MotionProfile({
      nodeCount: 60,
      linkCount: 120,
      migrationRate: 0.2,
    })

    expect(profile.chargeStrength).toBe(-88)
    expect(profile.linkDistance).toBe(38)
    expect(profile.communityStrength).toBeGreaterThan(0.038)
    expect(profile.velocityDecay).toBeGreaterThan(0.6)
    expect(profile.showNodeGlow).toBe(true)
    expect(profile.showMigrationTrails).toBe(true)
  })

  it('damps large graphs so training animation does not feel chaotic', () => {
    const profile = buildTask4MotionProfile({
      nodeCount: 900,
      linkCount: 2500,
      migrationRate: 0.4,
      selectedCommunityId: 1,
    })

    expect(profile.chargeStrength).toBe(-56)
    expect(profile.linkDistance).toBe(24)
    expect(profile.centerStrength).toBe(0.05)
    expect(profile.velocityDecay).toBeGreaterThan(0.8)
    expect(profile.showNodeGlow).toBe(false)
    expect(profile.showMigrationTrails).toBe(false)
  })
})

describe('buildTask4DendrogramRows', () => {
  it('normalizes scipy linkage rows for compact rendering', () => {
    const rows = buildTask4DendrogramRows({
      linkage_matrix: [
        [0, 1, 0.25, 2],
        [2, 3, 0.75, 4],
      ],
    })

    expect(rows).toEqual([
      { step: 0, left: 0, right: 1, distance: 0.25, size: 2, normalizedDistance: 0.3333333333333333 },
      { step: 1, left: 2, right: 3, distance: 0.75, size: 4, normalizedDistance: 1 },
    ])
  })

  it('returns [] when linkage data is absent', () => {
    expect(buildTask4DendrogramRows({})).toEqual([])
  })
})

describe('buildTask4ReasoningPack', () => {
  it('calls out boundary pressure when bridge ratio is high', () => {
    const pack = buildTask4ReasoningPack({
      modularity_q: 0.31,
      conductance: 0.42,
      bridge_ratio: 0.6,
      community_stability: 0.9,
      community_sizes: [3, 3],
      per_community_metrics: [{ size: 3, conductance: 0.5 }, { size: 3, conductance: 0.2 }],
      node_predictions: [0, 0, 0, 1, 1, 1],
      bridge_nodes: [true, true, false, false, false, true],
    }, [], null, 'GAT')

    expect(pack.dominantIssue).toBe('boundary')
    expect(pack.takeaway).toContain('bridge')
    expect(pack.communityCards[0].status).toBe('Ro ri manh')
  })
})

describe('buildTask4ReasoningHighlights', () => {
  it('surfaces best and worst communities plus epoch change summary', () => {
    const snaps = [
      {
        epoch: 0,
        modularity_q: 0.24,
        conductance: 0.18,
        bridge_ratio: 0.12,
        community_sizes: [4, 4],
        per_community_metrics: [{ size: 4, conductance: 0.22 }, { size: 4, conductance: 0.14 }],
        node_predictions: [0, 0, 0, 0, 1, 1, 1, 1],
        bridge_nodes: [true, false, false, false, false, false, false, false],
      },
      {
        epoch: 1,
        modularity_q: 0.39,
        conductance: 0.41,
        bridge_ratio: 0.45,
        community_stability: 0.82,
        community_sizes: [4, 4],
        per_community_metrics: [{ size: 4, conductance: 0.52 }, { size: 4, conductance: 0.16 }],
        node_predictions: [0, 0, 0, 0, 1, 1, 1, 1],
        bridge_nodes: [true, true, false, false, false, false, false, false],
      },
    ]

    const highlights = buildTask4ReasoningHighlights(snaps[1], snaps, 'GAT')

    expect(highlights.topIssueCommunity).toBe(0)
    expect(highlights.worstCommunity.id).toBe(0)
    expect(highlights.bestCommunity.id).toBe(1)
    expect(highlights.reportHeadline).toContain('C0')
    expect(highlights.epochChangeSummary).toContain('Bridge')
  })
})

describe('buildCoreCommunityEnvelopes', () => {
  it('keeps strong bridge outliers from defining the core hull', () => {
    const envelopes = buildCoreCommunityEnvelopes(
      [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 10, y: 0 },
        { id: 2, x: 0, y: 10 },
        { id: 3, x: 300, y: 300 },
      ],
      [0, 0, 0, 0],
      { bridge_nodes: [false, false, false, true], bridge_strength: [0, 0, 0, 0.9] }
    )

    expect(envelopes).toHaveLength(1)
    expect(envelopes[0].points.some((point) => point.x === 300)).toBe(false)
  })
})
