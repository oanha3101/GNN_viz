import { describe, expect, it } from 'vitest'
import {
  buildTask4LayoutIntensity,
  buildTask4NodeProfile,
  buildTask4PredictionToGroundTruthMap,
  buildTask4QualitySummary,
} from './task4Metrics'

describe('buildTask4LayoutIntensity', () => {
  it('keeps early epochs visually loose and late epochs more separated', () => {
    const early = buildTask4LayoutIntensity({ progress: 0, modularity: 0.12 })
    const mid = buildTask4LayoutIntensity({ progress: 0.45, modularity: 0.24 })
    const late = buildTask4LayoutIntensity({ progress: 1, modularity: 0.42 })

    expect(early.status).toBe('forming')
    expect(mid.status).toBe('separating')
    expect(late.status).toBe('stable')

    expect(early.forceMultiplier).toBeLessThan(mid.forceMultiplier)
    expect(mid.forceMultiplier).toBeLessThan(late.forceMultiplier)

    expect(early.crossEdgeSpread).toBeLessThan(mid.crossEdgeSpread)
    expect(mid.crossEdgeSpread).toBeLessThan(late.crossEdgeSpread)

    expect(early.hullOpacity).toBeGreaterThan(0.2)
    expect(early.hullOpacity).toBeLessThan(mid.hullOpacity)
    expect(mid.hullOpacity).toBeLessThan(late.hullOpacity)
  })

  it('aligns predicted community ids before checking ground-truth mismatch', () => {
    const snap = {
      node_predictions_aligned: [1, 1, 0, 0],
      bridge_nodes: [false, false, false, false],
      bridge_strength: [0, 0, 0, 0],
    }
    const graphData = {
      nodes: [{ id: 0, degree: 3 }, { id: 1, degree: 1 }, { id: 2, degree: 2 }, { id: 3, degree: 2 }],
      links: [{ source: 0, target: 1 }, { source: 2, target: 3 }],
    }

    const profile = buildTask4NodeProfile({
      snap,
      nodeId: 0,
      graphData,
      communityGroundTruth: [0, 0, 1, 1],
    })

    expect(profile.community).toBe(1)
    expect(profile.groundTruth).toBe(0)
    expect(profile.alignedGroundTruth).toBe(0)
    expect(profile.isMismatch).toBe(false)
  })

  it('maps each predicted cluster to its majority ground-truth label', () => {
    const mapping = buildTask4PredictionToGroundTruthMap(
      [2, 2, 1, 1, 1],
      [0, 0, 3, 3, 0],
    )

    expect(mapping.get(2)).toBe(0)
    expect(mapping.get(1)).toBe(3)
  })

  it('surfaces NMI as ground-truth agreement in the quality summary', () => {
    const summary = buildTask4QualitySummary({
      modularity_q: 0.379,
      conductance: 0.22,
      mean_silhouette: 0.41,
      mean_cluster_confidence: 0.73,
      bridge_ratio: 0.18,
      largest_community_ratio: 0.34,
      empty_community_count: 0,
      nmi_score: 0.652,
      training_phase: 'baseline',
      baseline_similarity: 0.61,
      visualization_confidence: 0.72,
    })

    expect(summary.gtAgreement).toBe(0.652)
    expect(summary.trainingPhase).toBe('baseline')
    expect(summary.phaseMeta.label).toBe('Baseline chưa train')
    expect(summary.baselineSimilarity).toBe(0.61)
    expect(summary.visualizationConfidence).toBe(0.72)
    expect(summary.healthScore).toBeGreaterThan(0)
  })
})
