/**
 * K-Hop Neighborhood Computation
 * Calculates 1-hop, 2-hop, 3-hop neighbors for a given node
 */

/**
 * Compute k-hop neighborhoods from a source node
 * @param {number} sourceNodeId - The source node ID
 * @param {Array} links - Array of {source, target} links
 * @param {number} maxHops - Maximum hop distance (default: 3)
 * @returns {Map<number, {hop: number, path: number[]}>} - Map of nodeId -> {hop, path}
 */
export function computeKHopNeighbors(sourceNodeId, links, maxHops = 3) {
  const neighbors = new Map()
  neighbors.set(sourceNodeId, { hop: 0, path: [sourceNodeId] })
  
  // BFS
  const queue = [[sourceNodeId, [sourceNodeId]]]
  const visited = new Set([sourceNodeId])
  
  for (let hop = 1; hop <= maxHops; hop++) {
    const levelSize = queue.length
    
    for (let i = 0; i < levelSize; i++) {
      const [currentNode, path] = queue.shift()
      
      // Find all neighbors of currentNode
      links.forEach((link) => {
        const src = typeof link.source === 'object' ? link.source.id : link.source
        const tgt = typeof link.target === 'object' ? link.target.id : link.target
        
        let neighborId = null
        if (src === currentNode) neighborId = tgt
        else if (tgt === currentNode) neighborId = src
        
        if (neighborId !== null && !visited.has(neighborId)) {
          visited.add(neighborId)
          const newPath = [...path, neighborId]
          neighbors.set(neighborId, { hop, path: newPath })
          queue.push([neighborId, newPath])
        }
      })
    }
  }
  
  return neighbors
}

/**
 * Get neighbors at a specific hop distance
 * @param {Map} neighbors - Result from computeKHopNeighbors
 * @param {number} hop - Hop distance to filter
 * @returns {Array<{id: number, path: number[]}>}
 */
export function getNeighborsAtHop(neighbors, hop) {
  const result = []
  neighbors.forEach((data, nodeId) => {
    if (data.hop === hop) {
      result.push({ id: nodeId, path: data.path })
    }
  })
  return result
}

/**
 * Count neighbors at each hop level
 * @param {Map} neighbors - Result from computeKHopNeighbors
 * @param {number} maxHops - Maximum hop distance
 * @returns {Array<number>} - Count of neighbors at each hop [1-hop count, 2-hop count, 3-hop count]
 */
export function countNeighborsPerHop(neighbors, maxHops = 3) {
  const counts = Array(maxHops).fill(0)
  neighbors.forEach((data) => {
    if (data.hop > 0 && data.hop <= maxHops) {
      counts[data.hop - 1]++
    }
  })
  return counts
}
