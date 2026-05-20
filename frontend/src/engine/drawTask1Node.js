function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function withAlpha(color, alpha) {
  if (!color) return `rgba(148,163,184,${alpha})`
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return `rgba(${r},${g},${b},${alpha})`
    }
  }
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (match) {
    return `rgba(${match[1]},${match[2]},${match[3]},${alpha})`
  }
  return `rgba(148,163,184,${alpha})`
}

export function drawTask1Node(node, ctx, globalScale, config) {
  const {
    selectedModel,
    isSelected,
    isHovered,
    kHopInfo,
    showNodeLabels = true,
    disableMotion = false,
    showcaseMode = false,
    largeGraph = false,
  } = config

  const degree = Number(node.degree || 0)
  const size = showcaseMode
    ? clamp(7 + Math.sqrt(Math.max(1, degree)) * 1.7, 8, 16)
    : clamp(4.4 + Math.sqrt(Math.max(1, degree)) * 1.2, 4.5, 11.5)
  const drawX = node.x
  const drawY = node.y
  const nodeColor = node.color || '#94a3b8'
  const majorityRatio = clamp(Number(node.majorityRatio || 0), 0, 1)
  const confidence = clamp(Number(node.confidence || 0), 0, 1)
  const boundaryScore = 1 - majorityRatio
  const isCorrect = node.isCorrect === true

  // Base atmospheric glow — skip expensive radial gradient for large graphs
  if (!largeGraph) {
    const baseGlow = ctx.createRadialGradient(drawX, drawY, size * 0.6, drawX, drawY, size * 2.4)
    baseGlow.addColorStop(0, withAlpha(nodeColor, 0.2))
    baseGlow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.beginPath()
    ctx.arc(drawX, drawY, size * 2.4, 0, 2 * Math.PI)
    ctx.fillStyle = baseGlow
    ctx.fill()
  }

  // K-hop context accent
  if (!largeGraph && kHopInfo && typeof kHopInfo === 'object' && kHopInfo.hop > 0) {
    const hopColors = ['#a855f7', '#6366f1', '#ec4899']
    const hopAlpha = 0.35 - kHopInfo.hop * 0.07
    ctx.beginPath()
    ctx.arc(drawX, drawY, size + 6 - kHopInfo.hop, 0, 2 * Math.PI)
    ctx.strokeStyle = `${hopColors[kHopInfo.hop - 1] || '#a855f7'}${Math.floor(clamp(hopAlpha, 0.08, 0.4) * 255).toString(16).padStart(2, '0')}`
    ctx.lineWidth = 1.5 / globalScale
    ctx.stroke()
  }

  if (selectedModel === 'GCN') {
    if (largeGraph) {
      // Simple ring — no gradient, no animation
      ctx.beginPath()
      ctx.arc(drawX, drawY, size + 2, 0, 2 * Math.PI)
      ctx.strokeStyle = `rgba(129, 140, 248, ${0.15 + majorityRatio * 0.25})`
      ctx.lineWidth = 1 / globalScale
      ctx.stroke()
    } else {
      const smoothingRatio = node.initialDirichletEnergy && node.dirichletEnergy != null && node.initialDirichletEnergy > 0
        ? clamp(node.dirichletEnergy / node.initialDirichletEnergy, 0, 1)
        : 0.5
      const ringRadius = size + 2 + majorityRatio * 3.5
      ctx.beginPath()
      ctx.arc(drawX, drawY, ringRadius, 0, 2 * Math.PI)
      ctx.strokeStyle = `rgba(129, 140, 248, ${0.18 + majorityRatio * 0.32})`
      ctx.lineWidth = (1.1 + (1 - smoothingRatio) * 0.9) / globalScale
      ctx.stroke()

      if (!disableMotion && majorityRatio > 0.72) {
        const ripple = (Date.now() % 1200) / 1200
        ctx.beginPath()
        ctx.arc(drawX, drawY, ringRadius + ripple * 4, 0, 2 * Math.PI)
        ctx.strokeStyle = `rgba(191, 219, 254, ${0.2 * (1 - ripple)})`
        ctx.lineWidth = 1 / globalScale
        ctx.stroke()
      }
    }
  }

  if (selectedModel === 'GAT') {
    const maxAttn = clamp(Number(node.maxAttn || 0), 0, 1)
    if (maxAttn > 0.02) {
      if (largeGraph) {
        // Simple ring — no gradient fill, no pulse animation
        ctx.beginPath()
        ctx.arc(drawX, drawY, size + 1.5 + maxAttn * 3, 0, 2 * Math.PI)
        ctx.strokeStyle = `rgba(96, 165, 250, ${0.15 + maxAttn * 0.3})`
        ctx.lineWidth = 1 / globalScale
        ctx.stroke()
      } else {
        const glowRadius = size + 1.5 + maxAttn * 5
        const pulse = disableMotion ? 0.85 : 0.75 + Math.sin(Date.now() / 280 + node.id * 0.8) * 0.15
        ctx.beginPath()
        ctx.arc(drawX, drawY, glowRadius, 0, 2 * Math.PI)
        ctx.fillStyle = `rgba(96, 165, 250, ${(0.08 + maxAttn * 0.26) * pulse})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(drawX, drawY, glowRadius + 2, 0, 2 * Math.PI)
        ctx.strokeStyle = `rgba(191, 219, 254, ${0.14 + maxAttn * 0.24})`
        ctx.lineWidth = 1.2 / globalScale
        ctx.stroke()
      }
    }
  }

  if (selectedModel === 'SAGE') {
    if (largeGraph) {
      // Simple ring — no dashed lines, no outer ring
      ctx.beginPath()
      ctx.arc(drawX, drawY, size + 2, 0, 2 * Math.PI)
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.12 + boundaryScore * 0.2})`
      ctx.lineWidth = 1 / globalScale
      ctx.stroke()
    } else {
      const neighborCount = Number(node.neighborContext?.total_neighbors || degree || 0)
      const supportRadius = size + 2 + clamp(neighborCount / 12, 0, 3)
      ctx.beginPath()
      ctx.arc(drawX, drawY, supportRadius, 0, 2 * Math.PI)
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.12 + boundaryScore * 0.24})`
      ctx.lineWidth = 1.1 / globalScale
      ctx.setLineDash(boundaryScore > 0.45 ? [2.5, 2.5] : [])
      ctx.stroke()
      ctx.setLineDash([])

      if (boundaryScore > 0.45) {
        ctx.beginPath()
        ctx.arc(drawX, drawY, supportRadius + 2.2, 0, 2 * Math.PI)
        ctx.strokeStyle = `rgba(244, 114, 182, ${0.10 + boundaryScore * 0.22})`
        ctx.lineWidth = 1 / globalScale
        ctx.stroke()
      }
    }
  }

  if (isSelected) {
    if (largeGraph) {
      // Simple solid ring — no animation, no dash
      ctx.beginPath()
      ctx.arc(drawX, drawY, size + 4, 0, 2 * Math.PI)
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 2 / globalScale
      ctx.stroke()
    } else {
      const pulse = disableMotion ? 2 : Math.sin(Date.now() / 250) * 2 + 3
      ctx.beginPath()
      ctx.arc(drawX, drawY, size + 5 + pulse, 0, 2 * Math.PI)
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 2 / globalScale
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])

      ctx.beginPath()
      ctx.arc(drawX, drawY, size + 4, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(34, 211, 238, 0.16)'
      ctx.fill()
    }
  }

  // Main node body
  ctx.beginPath()
  ctx.arc(drawX, drawY, size, 0, 2 * Math.PI)
  ctx.fillStyle = nodeColor
  ctx.fill()

  if (showcaseMode) {
    ctx.beginPath()
    ctx.arc(drawX, drawY, Math.max(2.2, size * 0.32), 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(255,255,255,0.94)'
    ctx.fill()
  }

  // Confidence ring
  if (!largeGraph) {
    ctx.beginPath()
    ctx.arc(drawX, drawY, size - 0.9, 0, 2 * Math.PI)
    ctx.strokeStyle = `rgba(255,255,255,${0.16 + confidence * 0.36})`
    ctx.lineWidth = 1 / globalScale
    ctx.stroke()
  }

  // Training / reference ring
  if (!largeGraph) {
    if (node.inTrainSet) {
      ctx.beginPath()
      ctx.arc(drawX, drawY, size + 1.8, 0, 2 * Math.PI)
      ctx.strokeStyle = 'rgba(255,255,255,0.38)'
      ctx.lineWidth = 0.9 / globalScale
      ctx.stroke()
    } else if (selectedModel === 'SAGE') {
      ctx.beginPath()
      ctx.arc(drawX, drawY, size + 1.8, 0, 2 * Math.PI)
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)'
      ctx.lineWidth = 1.1 / globalScale
      ctx.stroke()
    }
  }

  // Correctness chip
  if (!largeGraph && node.isCorrect != null) {
    ctx.beginPath()
    ctx.arc(drawX + size * 0.72, drawY - size * 0.72, Math.max(1.9, size * 0.22), 0, 2 * Math.PI)
    ctx.fillStyle = isCorrect ? 'rgba(74, 222, 128, 0.95)' : 'rgba(244, 63, 94, 0.95)'
    ctx.fill()
  }

  // Labeling only on tiny showcase graphs or direct focus
  if (showNodeLabels || isSelected || isHovered) {
    const fontSize = showcaseMode
      ? clamp(size * 0.78, 8, Math.max(12 / Math.sqrt(globalScale), 8))
      : clamp(size * 0.7, 7, Math.max(10 / Math.sqrt(globalScale), 7))
    ctx.font = `700 ${fontSize}px Inter, "JetBrains Mono", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = showcaseMode ? '#e9f2ff' : '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = showcaseMode ? 6 : 3
    ctx.fillText(`${node.id}`, drawX, drawY)
    ctx.shadowBlur = 0
  }

  if (isHovered || isSelected) {
    const label = `#${node.id}`
    const fontSize = Math.max(10, 12 / globalScale)
    ctx.font = `600 ${fontSize}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = '#f1f5f9'
    ctx.fillText(label, drawX, drawY - size - 4)
  }
}
