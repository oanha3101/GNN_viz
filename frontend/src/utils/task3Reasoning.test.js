import { describe, expect, it } from 'vitest'
import { buildEdgeReasoning, buildTask3ReasoningPack } from './task3Reasoning'

const graphData = {
  nodes: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
  links: [
    { source: 0, target: 2 },
    { source: 1, target: 2 },
    { source: 0, target: 3 },
    { source: 1, target: 3 },
    { source: 4, target: 5 },
  ],
}

describe('buildEdgeReasoning', () => {
  it('extracts overlap, path, and stability signals for one edge', () => {
    const reasoning = buildEdgeReasoning(
      graphData,
      { idx: 0, source: 0, target: 1, score: 0.82, exists: false, embeddingDistance: 0.25 },
      [
        { edge_scores: [0.44] },
        { edge_scores: [0.77] },
        { edge_scores: [0.82] },
      ],
      [0, 0, 1, 1, 2, 2],
      null,
      'en',
    )

    expect(reasoning.metrics.commonNeighbors).toBe(2)
    expect(reasoning.metrics.shortestPath).toBe(2)
    expect(reasoning.metrics.sameTopicCluster).toBe(true)
    expect(reasoning.stability.flipCount).toBe(1)
    expect(reasoning.rootCauseTags).toContain('unstable')
    expect(reasoning.confidenceStory).toBe('unstable_boundary')
    expect(reasoning.visualProof.length).toBeGreaterThan(0)
    expect(reasoning.narrative).toContain('same topic cluster')
    expect(reasoning.takeaway).toBeTruthy()
    expect(reasoning.evidenceBullets).toHaveLength(3)
    expect(reasoning.severityScore).toBeGreaterThan(0)
    expect(reasoning.dominantFailureMode).toBe('unstable')
    expect(reasoning.reportEvidence.length).toBeGreaterThanOrEqual(4)
  })

  it('finds ambiguous and bridge-like candidates across a pack', () => {
    const pack = buildTask3ReasoningPack({
      paired: [
        { idx: 0, source: 0, target: 1, score: 0.51, y: 0, exists: false, embeddingDistance: 0.8 },
        { idx: 1, source: 4, target: 0, score: 0.79, y: 1, exists: false, embeddingDistance: 0.3 },
      ],
      graphData,
      snapshots: [
        { edge_scores: [0.48, 0.73] },
        { edge_scores: [0.52, 0.79] },
      ],
      groundTruth: [0, 0, 1, 1, 2, 2],
      lang: 'en',
    })

    expect(pack.ambiguous[0].idx).toBe(0)
    expect(pack.bridgeEdges.some((row) => row.idx === 1)).toBe(true)
    expect(pack.priorityEdges[0].severityScore).toBeGreaterThanOrEqual(pack.priorityEdges.at(-1).severityScore)
    expect(pack.summary.dominant.label).toBeTruthy()
  })
})
