import { describe, it, expect } from 'vitest'
import {
  buildHistogram,
  computeGraphStats,
  buildComparisonHistograms,
  countInvalidityReasons,
  groupBySignature,
  filterGraphsBy,
} from './task6Metrics.js'

describe('buildHistogram', () => {
  it('bins samples uniformly across [0,1]', () => {
    const h = buildHistogram([0, 0.25, 0.5, 0.75, 0.99], 4, 0, 1)
    expect(h.map((b) => b.count)).toEqual([1, 1, 1, 2])
  })

  it('returns zero-counts when samples is empty', () => {
    const h = buildHistogram([], 3, 0, 1)
    expect(h).toHaveLength(3)
    expect(h.every((b) => b.count === 0)).toBe(true)
  })

  it('drops non-finite samples', () => {
    const h = buildHistogram([NaN, Infinity, 0.5], 2, 0, 1)
    expect(h[0].count + h[1].count).toBe(1)
  })
})

describe('computeGraphStats', () => {
  it('computes density + avgDegree + clustering from nodes/links', () => {
    // triangle — density=1, avgDegree=2, clustering=1
    const g = {
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }],
      links: [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
        { source: 0, target: 2 },
      ],
    }
    const s = computeGraphStats([g])
    expect(s.density[0]).toBeCloseTo(1, 3)
    expect(s.avgDegree[0]).toBeCloseTo(2, 3)
    expect(s.clustering[0]).toBeCloseTo(1, 3)
  })

  it('uses precomputed density / avg_degree when present', () => {
    const s = computeGraphStats([
      { nodes: [{ id: 0 }, { id: 1 }], links: [], density: 0.42, avg_degree: 1.5 },
    ])
    expect(s.density[0]).toBeCloseTo(0.42)
    expect(s.avgDegree[0]).toBeCloseTo(1.5)
  })

  it('handles empty or malformed input', () => {
    expect(computeGraphStats(null).density).toEqual([])
    expect(computeGraphStats([]).density).toEqual([])
    expect(computeGraphStats([null]).density).toEqual([])
  })
})

describe('buildComparisonHistograms', () => {
  it('returns 3 metrics each with source + generated arrays', () => {
    const src = [{ nodes: [{ id: 0 }, { id: 1 }], links: [{ source: 0, target: 1 }] }]
    const gen = [{ nodes: [{ id: 0 }, { id: 1 }], links: [] }]
    const h = buildComparisonHistograms(src, gen, 5)
    expect(Object.keys(h)).toEqual(['density', 'avgDegree', 'clustering'])
    expect(h.density.source).toHaveLength(5)
    expect(h.density.generated).toHaveLength(5)
    expect(h.avgDegree.source).toHaveLength(5)
    expect(h.clustering.generated).toHaveLength(5)
  })
})

describe('countInvalidityReasons', () => {
  it('aggregates invalid graphs sorted desc by count', () => {
    const rows = countInvalidityReasons([
      { valid: false, invalidity_reason: 'isolated' },
      { valid: false, invalidity_reason: 'isolated' },
      { valid: false, invalidity_reason: 'disconnected' },
      { valid: true },
    ])
    expect(rows[0]).toEqual({ reason: 'isolated', count: 2 })
    expect(rows[1]).toEqual({ reason: 'disconnected', count: 1 })
    expect(rows).toHaveLength(2)
  })

  it('labels missing reason as "unknown"', () => {
    const rows = countInvalidityReasons([{ valid: false }])
    expect(rows[0].reason).toBe('unknown')
  })

  it('returns empty array when no invalids present', () => {
    expect(countInvalidityReasons([{ valid: true }])).toEqual([])
    expect(countInvalidityReasons(null)).toEqual([])
  })
})

describe('groupBySignature', () => {
  it('counts duplicates and surfaces matches_source', () => {
    const out = groupBySignature([
      { id: 0, signature: 'a', matches_source: true },
      { id: 1, signature: 'a' },
      { id: 2, signature: 'b' },
    ])
    expect(out[0].signature).toBe('a')
    expect(out[0].count).toBe(2)
    expect(out[0].matchesSource).toBe(true)
    expect(out[0].ids).toEqual([0, 1])
    expect(out[1].count).toBe(1)
  })

  it('ignores graphs without signature', () => {
    expect(groupBySignature([{ id: 0 }])).toEqual([])
  })
})

describe('filterGraphsBy', () => {
  const graphs = [
    { id: 0, valid: true, matches_source: false },
    { id: 1, valid: false, matches_source: false },
    { id: 2, valid: true, matches_source: true },
  ]

  it('returns all by default', () => {
    expect(filterGraphsBy(graphs, 'all')).toHaveLength(3)
    expect(filterGraphsBy(graphs)).toHaveLength(3)
  })

  it('filters valid / invalid', () => {
    expect(filterGraphsBy(graphs, 'valid').map((g) => g.id)).toEqual([0, 2])
    expect(filterGraphsBy(graphs, 'invalid').map((g) => g.id)).toEqual([1])
  })

  it('filters novel (non matches_source)', () => {
    expect(filterGraphsBy(graphs, 'novel').map((g) => g.id)).toEqual([0, 1])
  })
})
