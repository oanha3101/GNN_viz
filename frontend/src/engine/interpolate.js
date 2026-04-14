import { CLASS_COLORS, getClassColor } from '../utils/colors'

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
  
  if (snapA.node_contributions && snapB.node_contributions) {
    res.node_contributions = snapA.node_contributions.map((arrA, i) => {
      const arrB = snapB.node_contributions[i] || arrA
      return arrA.map((valA, j) => lerp(valA, arrB[j] || valA, eT))
    })
  }
  
  if (snapA.attention_weights && snapB.attention_weights) {
    res.attention_weights = snapA.attention_weights.map((wA, i) =>
      lerp(wA, snapB.attention_weights[i] || wA, eT)
    )
  }
  
  if (snapA.edge_scores && snapB.edge_scores) {
    res.edge_scores = snapA.edge_scores.map((sA, i) =>
      lerp(sA, snapB.edge_scores[i] || sA, eT)
    )
  }
  
  if (snapA.auc != null && snapB.auc != null) res.auc = lerp(snapA.auc, snapB.auc, eT)
  if (snapA.ap != null && snapB.ap != null) res.ap = lerp(snapA.ap, snapB.ap, eT)
  
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
