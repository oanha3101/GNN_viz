import useGNNStore from '../store/useGNNStore'
import { buildTask4NodeProfile } from './task4Metrics'

/**
 * buildHoverSummary — Builds a task-aware summary of a node for the HoverCard.
 * 
 * @param {number} taskId - Current task ID (1-6)
 * @param {number|null} nodeId - ID of the hovered node
 * @param {object|null} snapshot - Current epoch snapshot from playerStore
 * @param {object|null} graphData - Graph data from gnnStore
 * @param {array|null} groundTruth - Ground truth labels from gnnStore
 * @returns {object|null} - { title, chips: [{label, value, tone}], rows: [{label, value}] }
 */
export function buildHoverSummary(taskId, nodeId, snapshot, graphData, groundTruth) {
  if (nodeId === null || !graphData || !graphData.nodes) return null

  const node = graphData.nodes.find(n => n.id === nodeId)
  if (!node) return null

  const summary = {
    title: `Node #${nodeId}`,
    chips: [],
    rows: [
      { label: 'Degree', value: node.degree ?? 0 }
    ]
  }

  // Add custom features if available (top 6)
  if (node.features && typeof node.features === 'object') {
    const featEntries = Object.entries(node.features)
    featEntries.slice(0, 6).forEach(([key, val]) => {
      summary.rows.push({ 
        label: key, 
        value: typeof val === 'number' ? val.toFixed(3) : val 
      })
    })
    if (featEntries.length > 6) {
      summary.rows.push({ label: '...', value: `+${featEntries.length - 6} more` })
    }
  }

  // Common fields (if available)
  const gt = groundTruth?.[nodeId]
  if (gt !== undefined) {
    summary.rows.push({ label: 'Ground Truth', value: gt })
  }

  // Task-specific logic
  switch (taskId) {
    case 1: { // Node Classification
      const pred = snapshot?.node_predictions?.[nodeId]
      const conf = snapshot?.node_confidence?.[nodeId]
      
      if (pred !== undefined) {
        const isCorrect = gt !== undefined ? pred === gt : null
        // Get string names for labels
        const classNames = useGNNStore.getState().classNames
        const predName = (classNames && classNames[pred]) || `Lớp ${pred}`
        const gtName = node.label_name || (classNames && classNames[gt]) || `Lớp ${gt}`

        summary.chips.push({
          label: isCorrect === null ? 'Predicted' : (isCorrect ? 'Correct' : 'Incorrect'),
          value: predName,
          tone: isCorrect === null ? 'blue' : (isCorrect ? 'green' : 'red')
        })
        summary.rows.push({ label: 'Ground Truth', value: gtName })
        summary.rows.push({ label: 'Confidence', value: `${((conf ?? 0) * 100).toFixed(1)}%` })
      }
      break
    }

    case 2: { // Graph Classification (node in drill-down)
      // Task 2 snapshot usually has node_contributions [graph_idx][node_idx]
      // We need to know which graph is currently selected/viewed to show contributions.
      // For now, show general info.
      break
    }

    case 3: { // Link Prediction
      // Link prediction snapshots might have link_scores for sampled pairs.
      // Hard to map back to a single node's "score" unless we aggregate.
      break
    }

    case 4: { // Community Detection
      const profile = buildTask4NodeProfile({ snap: snapshot, nodeId, graphData })
      if (profile?.community !== undefined) {
        summary.chips.push({ label: 'Community', value: profile.community, tone: 'purple' })
      }
      if (profile?.isBridge) {
        summary.chips.push({ label: 'Role', value: 'Bridge', tone: 'amber' })
      }
      if (Number.isFinite(profile?.bridgeStrength)) {
        summary.rows.push({ label: 'Bridge Strength', value: `${(profile.bridgeStrength * 100).toFixed(1)}%` })
      }
      if (Number.isFinite(profile?.confidence)) {
        summary.rows.push({ label: 'Confidence', value: `${(profile.confidence * 100).toFixed(1)}%` })
      }
      if (Number.isFinite(profile?.silhouette)) {
        summary.rows.push({ label: 'Silhouette', value: profile.silhouette.toFixed(3) })
      }
      if (Number.isFinite(profile?.crossCommunityNeighbors)) {
        summary.rows.push({ label: 'Cross-community Neighbors', value: profile.crossCommunityNeighbors })
      }
      break
    }

    case 5: { // Graph Embedding
      // Show class if labeled, degree, maybe KNN info if precomputed
      break
    }

    case 6: { // Graph Generation
      // Roles: isolated, hub, bridge, leaf, regular
      // These are often calculated on the fly in the component or helper
      if (node.role) {
        summary.chips.push({ label: 'Role', value: node.role, tone: 'cyan' })
      }
      break
    }
  }

  return summary
}
