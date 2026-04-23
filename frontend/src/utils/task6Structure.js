// Pure helpers that explain a generated graph's structure. No React / DOM.
// Used by TaskTopology6 cards to render shape badges, role colors, nearest
// source comparison, and deterministic force-directed layout.

function normalizeLinks(links, n) {
  const out = []
  if (!Array.isArray(links)) return out
  for (const l of links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source
    const t = typeof l.target === 'object' ? l.target.id : l.target
    if (!Number.isInteger(s) || !Number.isInteger(t)) continue
    if (s < 0 || t < 0 || s >= n || t >= n || s === t) continue
    out.push({ source: s, target: t })
  }
  return out
}

function buildAdjacency(nodes, links) {
  const n = nodes.length
  const adj = Array.from({ length: n }, () => new Set())
  for (const l of links) {
    adj[l.source].add(l.target)
    adj[l.target].add(l.source)
  }
  return adj
}

/**
 * countComponents — number of connected components in the graph.
 * Isolated nodes each count as a separate component.
 */
export function countComponents(nodes, links) {
  const n = nodes?.length ?? 0
  if (n === 0) return 0
  const edges = normalizeLinks(links, n)
  const adj = buildAdjacency(nodes, edges)
  const visited = new Array(n).fill(false)
  let comps = 0
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue
    comps += 1
    const stack = [i]
    while (stack.length) {
      const v = stack.pop()
      if (visited[v]) continue
      visited[v] = true
      for (const u of adj[v]) if (!visited[u]) stack.push(u)
    }
  }
  return comps
}

/**
 * countTriangles — total number of triangles (3-cliques). Divides triangle
 * sum by 3 since each triangle is counted from each vertex.
 */
export function countTriangles(nodes, links) {
  const n = nodes?.length ?? 0
  if (n < 3) return 0
  const edges = normalizeLinks(links, n)
  const adj = buildAdjacency(nodes, edges)
  let tri = 0
  for (let i = 0; i < n; i++) {
    const neigh = Array.from(adj[i])
    for (let a = 0; a < neigh.length; a++) {
      for (let b = a + 1; b < neigh.length; b++) {
        if (adj[neigh[a]].has(neigh[b])) tri += 1
      }
    }
  }
  return Math.floor(tri / 3)
}

/**
 * classifyGraphShape — returns a short, human-readable label describing the
 * overall topology. Priority:
 *   disconnected > star > clique > cycle > tree > dense > sparse > generic
 * Used as a single-word badge next to each card.
 */
export function classifyGraphShape(nodes, links) {
  const n = nodes?.length ?? 0
  if (n === 0) return 'empty'
  const edges = normalizeLinks(links, n)
  const m = edges.length
  if (m === 0) return 'empty'
  if (countComponents(nodes, edges) > 1) return 'disconnected'
  const adj = buildAdjacency(nodes, edges)
  const degs = adj.map((s) => s.size)
  const maxEdges = (n * (n - 1)) / 2
  const density = m / Math.max(1, maxEdges)
  if (m === maxEdges) return 'clique'
  // Star — 1 center with degree n-1, all others degree 1.
  const leaves = degs.filter((d) => d === 1).length
  const center = degs.filter((d) => d === n - 1).length
  if (n >= 4 && center === 1 && leaves === n - 1) return 'star'
  // Cycle — every node degree 2, connected, m = n.
  if (n >= 3 && m === n && degs.every((d) => d === 2)) return 'cycle'
  // Tree — connected, m = n-1.
  if (m === n - 1) return 'tree'
  if (density >= 0.6) return 'dense'
  if (density <= 0.25) return 'sparse'
  return 'generic'
}

/**
 * roleForNode — classifies each node for colouring:
 *   'isolated' | 'hub' | 'bridge' | 'leaf' | 'regular'
 * - isolated: degree 0
 * - hub: one of the top-ceil(n/6) highest degrees (min degree≥3)
 * - leaf: degree 1
 * - bridge: removing the node splits its component (articulation point)
 * - regular: everything else
 * Returns an array of length `n` indexed by node id.
 */
export function classifyNodeRoles(nodes, links) {
  const n = nodes?.length ?? 0
  if (n === 0) return []
  const edges = normalizeLinks(links, n)
  const adj = buildAdjacency(nodes, edges)
  const degs = adj.map((s) => s.size)
  const articulation = findArticulationPoints(n, adj)
  const sorted = [...degs].map((d, i) => ({ d, i })).sort((a, b) => b.d - a.d)
  const hubCount = Math.max(1, Math.ceil(n / 6))
  const hubThreshold = sorted[Math.min(hubCount - 1, sorted.length - 1)]?.d ?? Infinity
  const minHubDeg = 3
  const roles = new Array(n).fill('regular')
  for (let i = 0; i < n; i++) {
    if (degs[i] === 0) roles[i] = 'isolated'
    else if (degs[i] === 1) roles[i] = 'leaf'
    else if (articulation.has(i)) roles[i] = 'bridge'
    else if (degs[i] >= minHubDeg && degs[i] >= hubThreshold) roles[i] = 'hub'
  }
  return roles
}

function findArticulationPoints(n, adj) {
  const art = new Set()
  const disc = new Array(n).fill(-1)
  const low = new Array(n).fill(-1)
  const parent = new Array(n).fill(-1)
  let time = 0
  const dfs = (u) => {
    disc[u] = low[u] = time++
    let children = 0
    for (const v of adj[u]) {
      if (disc[v] === -1) {
        parent[v] = u
        children += 1
        dfs(v)
        low[u] = Math.min(low[u], low[v])
        if (parent[u] === -1 && children > 1) art.add(u)
        if (parent[u] !== -1 && low[v] >= disc[u]) art.add(u)
      } else if (v !== parent[u]) {
        low[u] = Math.min(low[u], disc[v])
      }
    }
  }
  for (let i = 0; i < n; i++) if (disc[i] === -1) dfs(i)
  return art
}

/**
 * computeForceLayout — deterministic mini force-directed layout over `size`
 * pixels. Initial positions = circle seeded by id; then ~80 iterations of
 * Fruchterman-Reingold with linear cooling. Returns `{ [id]: {x, y} }`.
 * Pure function: same input → same output.
 */
export function computeForceLayout(nodes, links, size = 140, iterations = 80) {
  const n = nodes?.length ?? 0
  if (n === 0) return {}
  const padding = 12
  const w = size - padding * 2
  const h = size - padding * 2
  const area = w * h
  const k = Math.sqrt(area / Math.max(1, n))
  const pos = new Array(n)
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    pos[i] = {
      x: padding + w / 2 + Math.cos(angle) * (w / 2 - 2),
      y: padding + h / 2 + Math.sin(angle) * (h / 2 - 2),
    }
  }
  const edges = normalizeLinks(links, n)
  let temp = w / 10
  const cool = temp / iterations
  for (let it = 0; it < iterations; it++) {
    const disp = Array.from({ length: n }, () => ({ x: 0, y: 0 }))
    // Repulsive
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x
        const dy = pos[i].y - pos[j].y
        const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy))
        const f = (k * k) / dist
        const fx = (dx / dist) * f
        const fy = (dy / dist) * f
        disp[i].x += fx; disp[i].y += fy
        disp[j].x -= fx; disp[j].y -= fy
      }
    }
    // Attractive
    for (const e of edges) {
      const dx = pos[e.source].x - pos[e.target].x
      const dy = pos[e.source].y - pos[e.target].y
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy))
      const f = (dist * dist) / k
      const fx = (dx / dist) * f
      const fy = (dy / dist) * f
      disp[e.source].x -= fx; disp[e.source].y -= fy
      disp[e.target].x += fx; disp[e.target].y += fy
    }
    // Apply with temperature and boundary clamp
    for (let i = 0; i < n; i++) {
      const d = disp[i]
      const mag = Math.max(0.01, Math.sqrt(d.x * d.x + d.y * d.y))
      const step = Math.min(mag, temp)
      pos[i].x += (d.x / mag) * step
      pos[i].y += (d.y / mag) * step
      pos[i].x = Math.max(padding, Math.min(size - padding, pos[i].x))
      pos[i].y = Math.max(padding, Math.min(size - padding, pos[i].y))
    }
    temp = Math.max(0.01, temp - cool)
  }
  const out = {}
  for (let i = 0; i < n; i++) out[nodes[i].id] = { x: pos[i].x, y: pos[i].y }
  return out
}

/**
 * structuralFingerprint — scalar vector describing a graph for similarity
 * matching. Used by `findNearestSourceGraph`.
 */
export function structuralFingerprint(nodes, links) {
  const n = nodes?.length ?? 0
  if (n === 0) return { n: 0, m: 0, density: 0, avgDegree: 0, clustering: 0 }
  const edges = normalizeLinks(links, n)
  const m = edges.length
  const maxEdges = Math.max(1, (n * (n - 1)) / 2)
  const density = m / maxEdges
  const avgDegree = (m * 2) / Math.max(1, n)
  const adj = buildAdjacency(nodes, edges)
  let clust = 0
  let counted = 0
  for (let i = 0; i < n; i++) {
    const neigh = Array.from(adj[i])
    const k = neigh.length
    if (k < 2) continue
    let tri = 0
    for (let a = 0; a < neigh.length; a++) {
      for (let b = a + 1; b < neigh.length; b++) {
        if (adj[neigh[a]].has(neigh[b])) tri += 1
      }
    }
    clust += (2 * tri) / (k * (k - 1))
    counted += 1
  }
  const clustering = counted ? clust / counted : 0
  return { n, m, density, avgDegree, clustering }
}

/**
 * findNearestSourceGraph — from `sourceGraphs`, pick the entry closest to the
 * target graph by L2 distance on (n/12, density, clustering). `n` is rescaled
 * so the dominant axis isn't just graph size. Returns `{ graph, distance }`
 * or `null` when sources are empty.
 */
export function findNearestSourceGraph(target, sourceGraphs) {
  if (!target || !Array.isArray(sourceGraphs) || sourceGraphs.length === 0) return null
  const ft = structuralFingerprint(target.nodes || [], target.links || [])
  let best = null
  let bestDist = Infinity
  for (const g of sourceGraphs) {
    const f = structuralFingerprint(g.nodes || [], g.links || [])
    const dn = (ft.n - f.n) / 12
    const dd = ft.density - f.density
    const dc = ft.clustering - f.clustering
    const dist = dn * dn + dd * dd + dc * dc
    if (dist < bestDist) {
      bestDist = dist
      best = g
    }
  }
  return best ? { graph: best, distance: Math.sqrt(bestDist) } : null
}
