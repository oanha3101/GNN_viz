import { describe, it, expect } from 'vitest'
import { buildHoverSummary } from './nodeHoverSummary'

describe('buildHoverSummary', () => {
  const mockGraphData = {
    nodes: [
      { id: 0, degree: 5 },
      { id: 1, degree: 2 }
    ],
    links: []
  }

  it('returns null if nodeId is null', () => {
    expect(buildHoverSummary(1, null, {}, mockGraphData, [])).toBeNull()
  })

  it('returns null if node not found', () => {
    expect(buildHoverSummary(1, 999, {}, mockGraphData, [])).toBeNull()
  })

  it('handles Task 1 (Node Classification)', () => {
    const snapshot = {
      node_predictions: [2, 1],
      node_confidence: [0.85, 0.9]
    }
    const groundTruth = [2, 0] // node 0 correct, node 1 incorrect
    
    const result0 = buildHoverSummary(1, 0, snapshot, mockGraphData, groundTruth)
    expect(result0.title).toBe('Node #0')
    expect(result0.chips[0]).toEqual({ label: 'Correct', value: 'Lớp 2', tone: 'green' })
    expect(result0.rows).toContainEqual({ label: 'Confidence', value: '85.0%' })

    const result1 = buildHoverSummary(1, 1, snapshot, mockGraphData, groundTruth)
    expect(result1.chips[0]).toEqual({ label: 'Incorrect', value: 'Lớp 1', tone: 'red' })
  })

  it('handles Task 4 (Community Detection)', () => {
    const snapshot = {
      community_ids: [10, 20],
      bridge_nodes: [1]
    }
    
    const result0 = buildHoverSummary(4, 0, snapshot, mockGraphData, null)
    expect(result0.chips[0]).toEqual({ label: 'Community', value: 10, tone: 'purple' })

    const result1 = buildHoverSummary(4, 1, snapshot, mockGraphData, null)
    expect(result1.chips).toContainEqual({ label: 'Role', value: 'Bridge', tone: 'amber' })
  })
})
