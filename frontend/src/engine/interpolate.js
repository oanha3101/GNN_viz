import { getClassColor } from '../utils/colors'

export function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

export function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function hexToRgba(hex, alpha = 1) {
  const h = hex.charAt(0) === '#' ? hex.substr(1) : hex
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`
  const r = parseInt(h.substr(0, 2), 16)
  const g = parseInt(h.substr(2, 2), 16)
  const b = parseInt(h.substr(4, 2), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function lerpColor(hexA, hexB, t) {
  if (!hexA || !hexB) return hexA || hexB || '#000000'
  
  if (hexA.startsWith('rgba') || hexB.startsWith('rgba')) {
    const parse = (c) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (!m) return [0,0,0,1]
      return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] !== undefined ? parseFloat(m[4]) : 1]
    }
    const cA = hexA.startsWith('rgba') || hexA.startsWith('rgb') ? hexA : hexToRgba(hexA)
    const cB = hexB.startsWith('rgba') || hexB.startsWith('rgb') ? hexB : hexToRgba(hexB)
    
    const pA = parse(cA)
    const pB = parse(cB)
    
    const r = Math.round(lerp(pA[0], pB[0], t))
    const g = Math.round(lerp(pA[1], pB[1], t))
    const b = Math.round(lerp(pA[2], pB[2], t))
    const a = lerp(pA[3], pB[3], t)
    return `rgba(${r},${g},${b},${a})`
  }

  const ha = hexA.charAt(0) === '#' ? hexA.substr(1) : hexA
  const hb = hexB.charAt(0) === '#' ? hexB.substr(1) : hexB
  if (ha.length !== 6 || hb.length !== 6) return hexB
  
  const ra = parseInt(ha.substr(0, 2), 16), ga = parseInt(ha.substr(2, 2), 16), ba = parseInt(ha.substr(4, 2), 16)
  const rb = parseInt(hb.substr(0, 2), 16), gb = parseInt(hb.substr(2, 2), 16), bb = parseInt(hb.substr(4, 2), 16)
  
  const r = Math.round(lerp(ra, rb, t))
  const g = Math.round(lerp(ga, gb, t))
  const b = Math.round(lerp(ba, bb, t))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function interpolateSnapshots(snapA, snapB, t) {
  if (!snapB || t === 0) return snapA
  if (t === 1) return snapB
  const eT = easeInOutCubic(t)
  
  const res = { ...snapA }
  
  // Basic metrics
  if (snapA.train_loss != null && snapB.train_loss != null) res.train_loss = lerp(snapA.train_loss, snapB.train_loss, eT)
  if (snapA.val_loss != null && snapB.val_loss != null) res.val_loss = lerp(snapA.val_loss, snapB.val_loss, eT)
  if (snapA.train_acc != null && snapB.train_acc != null) res.train_acc = lerp(snapA.train_acc, snapB.train_acc, eT)
  if (snapA.val_acc != null && snapB.val_acc != null) res.val_acc = lerp(snapA.val_acc, snapB.val_acc, eT)

  // Embeddings & Points
  if (snapA.embeddings_2d && snapB.embeddings_2d) {
    res.embeddings_2d = snapA.embeddings_2d.map((ptA, i) => {
      const ptB = snapB.embeddings_2d[i] || ptA
      return [lerp(ptA[0], ptB[0], eT), lerp(ptA[1], ptB[1], eT)]
    })
  }

  if (snapA.graph_embeddings_2d && snapB.graph_embeddings_2d) {
    res.graph_embeddings_2d = snapA.graph_embeddings_2d.map((ptA, i) => {
      const ptB = snapB.graph_embeddings_2d[i] || ptA
      return [lerp(ptA[0], ptB[0], eT), lerp(ptA[1], ptB[1], eT)]
    })
  }

  // Task 6: Latent Points
  if (snapA.latent_points && snapB.latent_points) {
    res.latent_points = snapA.latent_points.map((ptA, i) => {
      const ptB = snapB.latent_points[i] || ptA
      return [lerp(ptA[0], ptB[0], eT), lerp(ptA[1], ptB[1], eT)]
    })
  }
  if (snapA.latent_point_scores && snapB.latent_point_scores) {
    res.latent_point_scores = snapA.latent_point_scores.map((sA, i) =>
      lerp(sA, snapB.latent_point_scores[i] ?? sA, eT)
    )
  }

  // Task specific metrics
  if (snapA.node_contributions && snapB.node_contributions) {
    res.node_contributions = snapA.node_contributions.map((arrA, i) => {
      const arrB = snapB.node_contributions[i] ?? arrA
      return arrA.map((valA, j) => lerp(valA, arrB[j] ?? valA, eT))
    })
  }

  if (snapA.attention_weights && snapB.attention_weights) {
    res.attention_weights = snapA.attention_weights.map((wA, i) =>
      lerp(wA, snapB.attention_weights[i] ?? wA, eT)
    )
  }

  if (snapA.edge_scores && snapB.edge_scores) {
    res.edge_scores = snapA.edge_scores.map((sA, i) =>
      lerp(sA, snapB.edge_scores[i] ?? sA, eT)
    )
  }

  if (snapA.auc != null && snapB.auc != null) res.auc = lerp(snapA.auc, snapB.auc, eT)
  if (snapA.ap != null && snapB.ap != null) res.ap = lerp(snapA.ap, snapB.ap, eT)

  // Task 3: Link Prediction — model-specific signatures
  if (snapA.dirichlet_energy != null && snapB.dirichlet_energy != null) res.dirichlet_energy = lerp(snapA.dirichlet_energy, snapB.dirichlet_energy, eT)
  if (snapA.smoothness_separation != null && snapB.smoothness_separation != null) res.smoothness_separation = lerp(snapA.smoothness_separation, snapB.smoothness_separation, eT)
  if (snapA.score_variance != null && snapB.score_variance != null) res.score_variance = lerp(snapA.score_variance, snapB.score_variance, eT)
  if (snapA.edge_similarity && snapB.edge_similarity) {
    res.edge_similarity = snapA.edge_similarity.map((sA, i) => lerp(sA, snapB.edge_similarity[i] ?? sA, eT))
  }

  // Task 4: Community Detection
  if (snapA.bridge_strength && snapB.bridge_strength) {
    res.bridge_strength = snapA.bridge_strength.map((sA, i) =>
      lerp(sA, snapB.bridge_strength[i] ?? sA, eT)
    )
  }
  if (snapA.silhouette_scores && snapB.silhouette_scores) {
    res.silhouette_scores = snapA.silhouette_scores.map((sA, i) =>
      lerp(sA, snapB.silhouette_scores[i] ?? sA, eT)
    )
  }
  if (snapA.cluster_confidence && snapB.cluster_confidence) {
    res.cluster_confidence = snapA.cluster_confidence.map((sA, i) =>
      lerp(sA, snapB.cluster_confidence[i] ?? sA, eT)
    )
  }
  if (snapA.local_smoothness && snapB.local_smoothness) {
    res.local_smoothness = snapA.local_smoothness.map((sA, i) =>
      lerp(sA, snapB.local_smoothness[i] ?? sA, eT)
    )
  }

  // Task 5: Graph Embedding
  if (snapA.proximity_scores && snapB.proximity_scores) {
    res.proximity_scores = snapA.proximity_scores.map((pA, i) => {
      const pB = snapB.proximity_scores[i] ?? pA
      return { source: pA.source, target: pA.target, score: lerp(pA.score, pB.score, eT) }
    })
  }
  if (snapA.per_node_knn_preservation && snapB.per_node_knn_preservation) {
    res.per_node_knn_preservation = snapA.per_node_knn_preservation.map((kA, i) =>
      lerp(kA, snapB.per_node_knn_preservation[i] ?? kA, eT)
    )
  }

  // Task 2: Graph Classification
  if (snapA.graph_confidences && snapB.graph_confidences) {
    res.graph_confidences = snapA.graph_confidences.map((cA, i) =>
      lerp(cA, snapB.graph_confidences[i] ?? cA, eT)
    )
  }
  if (snapA.confidence_margins && snapB.confidence_margins) {
    res.confidence_margins = snapA.confidence_margins.map((mA, i) =>
      lerp(mA, snapB.confidence_margins[i] ?? mA, eT)
    )
  }

  // Task 6: Generation Quality
  if (snapA.validity_rate != null && snapB.validity_rate != null) res.validity_rate = lerp(snapA.validity_rate, snapB.validity_rate, eT)
  if (snapA.uniqueness_rate != null && snapB.uniqueness_rate != null) res.uniqueness_rate = lerp(snapA.uniqueness_rate, snapB.uniqueness_rate, eT)
  if (snapA.novelty_rate != null && snapB.novelty_rate != null) res.novelty_rate = lerp(snapA.novelty_rate, snapB.novelty_rate, eT)
  if (snapA.recon_loss != null && snapB.recon_loss != null) res.recon_loss = lerp(snapA.recon_loss, snapB.recon_loss, eT)
  if (snapA.kl_loss != null && snapB.kl_loss != null) res.kl_loss = lerp(snapA.kl_loss, snapB.kl_loss, eT)

  // Scalar metrics that need smooth interpolation
  if (snapA.dirichlet_energy != null && snapB.dirichlet_energy != null) res.dirichlet_energy = lerp(snapA.dirichlet_energy, snapB.dirichlet_energy, eT)
  if (snapA.modularity_q != null && snapB.modularity_q != null) res.modularity_q = lerp(snapA.modularity_q, snapB.modularity_q, eT)
  if (snapA.attention_boundary_ratio != null && snapB.attention_boundary_ratio != null) res.attention_boundary_ratio = lerp(snapA.attention_boundary_ratio, snapB.attention_boundary_ratio, eT)
  if (snapA.sage_robustness != null && snapB.sage_robustness != null) res.sage_robustness = lerp(snapA.sage_robustness, snapB.sage_robustness, eT)
  if (snapA.knn_preservation != null && snapB.knn_preservation != null) res.knn_preservation = lerp(snapA.knn_preservation, snapB.knn_preservation, eT)
  if (snapA.link_recon_auc != null && snapB.link_recon_auc != null) res.link_recon_auc = lerp(snapA.link_recon_auc, snapB.link_recon_auc, eT)
  if (snapA.isotropy_score != null && snapB.isotropy_score != null) res.isotropy_score = lerp(snapA.isotropy_score, snapB.isotropy_score, eT)
  if (snapA.stress_score != null && snapB.stress_score != null) res.stress_score = lerp(snapA.stress_score, snapB.stress_score, eT)
  
  // For discrete data, we usually keep snapB as the target, but maybe show snapA if t < 0.5
  if (t > 0.5) {
    res.generated_graphs = snapB.generated_graphs
  } else {
    res.generated_graphs = snapA.generated_graphs
  }

  // Discrete: graph predictions (Task 2) — snap at midpoint
  if (t > 0.5) {
    res.graph_predictions = snapB.graph_predictions
  } else {
    res.graph_predictions = snapA.graph_predictions
  }

  return res
}

// Advanced node coloring with Error Mode support
export function getNodeColor(predA, predB, t, isErrorMode = false, groundTruth = null) {
  // If in Error Mode and we have ground truth, use binary Correct/Incorrect coloring
  if (isErrorMode && groundTruth !== null) {
    const isCorrectA = predA === groundTruth
    const isCorrectB = predB === groundTruth
    
    const colorCorrect = 'rgba(34, 197, 94, 0.3)' // Green-500 with low opacity
    const colorError = '#ef4444' // Red-500 (Solid)
    
    const cA = isCorrectA ? colorCorrect : colorError
    const cB = isCorrectB ? colorCorrect : colorError
    
    if (cA === cB) return cA
    return lerpColor(cA, cB, t)
  }

  // Standard Prediction Mode: Color by class
  const cA = getClassColor(predA)
  const cB = getClassColor(predB)
  
  if (predA === predB) return cA
  
  // Smooth transition between classes through a neutral gray
  const gray = '#94a3b8'
  if (t < 0.5) {
    return lerpColor(cA, gray, t * 2)
  } else {
    return lerpColor(gray, cB, (t - 0.5) * 2)
  }
}

export function getEdgeAppearance(wA, wB, t) {
  const weight = lerp(wA, wB, t)
  const baseColor = '#1e293b' // slate-800
  const activeColor = '#3b82f6' // blue-500
  
  return {
    color: lerpColor(baseColor, activeColor, weight),
    width: 0.5 + Math.max(0, weight * 2)
  }
}
