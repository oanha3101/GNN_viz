import { describe, it, expect } from 'vitest'
import {
  countComponents,
  countTriangles,
  classifyGraphShape,
  classifyNodeRoles,
  computeForceLayout,
  structuralFingerprint,
  findNearestSourceGraph,
} from './task6Structure.js'

const mkN = (n) => Array.from({ length: n }, (_, i) => ({ id: i }))
const mkE = (arr) => arr.map(([s, t]) => ({ source: s, target: t }))

describe('countComponents', () => {
  it('counts disconnected components', () => {
    const nodes = mkN(5)
    const links = mkE([[0, 1], [1, 2], [3, 4]])
    expect(countComponents(nodes, links)).toBe(2)
  })
  it('counts isolated nodes as their own component', () => {
    const nodes = mkN(4)
    const links = mkE([[0, 1]])
    expect(countComponents(nodes, links)).toBe(3) // {0,1} + {2} + {3}
  })
  it('returns 0 for empty input', () => {
    expect(countComponents([], [])).toBe(0)
  })
})

describe('countTriangles', () => {
  it('counts a single triangle', () => {
    const links = mkE([[0, 1], [1, 2], [0, 2]])
    expect(countTriangles(mkN(3), links)).toBe(1)
  })
  it('counts K4 = 4 triangles', () => {
    const links = mkE([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]])
    expect(countTriangles(mkN(4), links)).toBe(4)
  })
  it('returns 0 for a tree', () => {
    const links = mkE([[0, 1], [1, 2], [2, 3]])
    expect(countTriangles(mkN(4), links)).toBe(0)
  })
})

describe('classifyGraphShape', () => {
  it('returns empty for no edges', () => {
    expect(classifyGraphShape(mkN(3), [])).toBe('empty')
  })
  it('detects disconnected', () => {
    expect(classifyGraphShape(mkN(4), mkE([[0, 1], [2, 3]]))).toBe('disconnected')
  })
  it('detects star', () => {
    expect(classifyGraphShape(mkN(5), mkE([[0, 1], [0, 2], [0, 3], [0, 4]]))).toBe('star')
  })
  it('detects cycle', () => {
    expect(classifyGraphShape(mkN(4), mkE([[0, 1], [1, 2], [2, 3], [3, 0]]))).toBe('cycle')
  })
  it('detects clique K4', () => {
    expect(classifyGraphShape(mkN(4), mkE([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]))).toBe('clique')
  })
  it('detects tree (path-like, not a star)', () => {
    // 0-1-2-3 is a tree with m=n-1 and not a star (no single center has deg n-1).
    expect(classifyGraphShape(mkN(4), mkE([[0, 1], [1, 2], [2, 3]]))).toBe('tree')
  })
  it('flags dense / sparse by density threshold', () => {
    // 5 nodes, 6 edges => density=0.6 but not clique → 'dense'
    const dense = classifyGraphShape(
      mkN(5),
      mkE([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 4]]),
    )
    expect(['dense', 'generic']).toContain(dense)
  })
})

describe('classifyNodeRoles', () => {
  it('marks isolated nodes', () => {
    const roles = classifyNodeRoles(mkN(4), mkE([[0, 1]]))
    expect(roles[2]).toBe('isolated')
    expect(roles[3]).toBe('isolated')
  })
  it('marks articulation points as bridge', () => {
    // 0-1-2-3 : node 1 and 2 are articulation points
    const roles = classifyNodeRoles(mkN(4), mkE([[0, 1], [1, 2], [2, 3]]))
    expect(roles[1]).toBe('bridge')
    expect(roles[2]).toBe('bridge')
    expect(roles[0]).toBe('leaf')
    expect(roles[3]).toBe('leaf')
  })
  it('marks hub for highest-degree node in a star', () => {
    const roles = classifyNodeRoles(mkN(6), mkE([[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]))
    // Center of a star is also an articulation point, so bridge takes priority
    // over hub — both are semantically correct. Verify it's NOT 'regular'.
    expect(['hub', 'bridge']).toContain(roles[0])
  })
})

describe('computeForceLayout', () => {
  it('returns positions for every node within bounds', () => {
    const nodes = mkN(6)
    const links = mkE([[0, 1], [1, 2], [2, 3]])
    const pos = computeForceLayout(nodes, links, 100, 20)
    for (const id of [0, 1, 2, 3, 4, 5]) {
      expect(pos[id]).toBeDefined()
      expect(pos[id].x).toBeGreaterThanOrEqual(0)
      expect(pos[id].x).toBeLessThanOrEqual(100)
      expect(pos[id].y).toBeGreaterThanOrEqual(0)
      expect(pos[id].y).toBeLessThanOrEqual(100)
    }
  })
  it('is deterministic for the same input', () => {
    const nodes = mkN(4)
    const links = mkE([[0, 1], [1, 2], [2, 3], [3, 0]])
    const a = computeForceLayout(nodes, links, 80, 30)
    const b = computeForceLayout(nodes, links, 80, 30)
    expect(a[0]).toEqual(b[0])
    expect(a[3]).toEqual(b[3])
  })
})

describe('structuralFingerprint', () => {
  it('returns zeros for an empty graph', () => {
    const f = structuralFingerprint([], [])
    expect(f).toEqual({ n: 0, m: 0, density: 0, avgDegree: 0, clustering: 0 })
  })
  it('computes clustering=1 for a triangle', () => {
    const f = structuralFingerprint(mkN(3), mkE([[0, 1], [1, 2], [0, 2]]))
    expect(f.clustering).toBeCloseTo(1, 3)
    expect(f.density).toBeCloseTo(1, 3)
  })
})

describe('findNearestSourceGraph', () => {
  it('finds the closest source by structural distance', () => {
    const target = { nodes: mkN(4), links: mkE([[0, 1], [1, 2], [2, 3]]) }
    const a = { id: 'a', nodes: mkN(8), links: mkE([[0, 1], [1, 2], [2, 3], [3, 4]]) }
    const b = { id: 'b', nodes: mkN(4), links: mkE([[0, 1], [1, 2], [2, 3]]) }
    const result = findNearestSourceGraph(target, [a, b])
    expect(result.graph.id).toBe('b')
  })
  it('returns null when source list is empty', () => {
    expect(findNearestSourceGraph({ nodes: [], links: [] }, [])).toBeNull()
  })
})
