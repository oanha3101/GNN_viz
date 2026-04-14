export function drawTask1Node(node, ctx, globalScale, config) {
  const { currentEpochFloat, totalEpochs, selectedModel, isSelected, isHovered } = config
  const size = Math.sqrt(node.degree || 1) * 2.5 + 3
  
  let drawX = node.x
  let drawY = node.y

  // 1. SAGE Jitter & Inductive Discovery Effect
  if (selectedModel === 'SAGE') {
     const epochProgress = currentEpochFloat / (totalEpochs || 100)
     const jitterScale = node.isInductive ? 8 : Math.max(0, 5 * (1 - epochProgress))
     
     // Special analyzing ring for new nodes
     if (node.isInductive) {
        const analyzePulse = (Date.now() % 1000) / 1000
        ctx.beginPath()
        ctx.arc(drawX, drawY, size + 6 + analyzePulse * 4, 0, 2 * Math.PI)
        ctx.strokeStyle = `rgba(139, 92, 246, ${1 - analyzePulse})`
        ctx.lineWidth = 2
        ctx.stroke()
        
        // Overwrite color to gray if it's "freshly" added (simulating thinking time)
        // We use a property 'discoveryProgress' if we want more control, 
        // but for now, let's make it pulse until it stabilizes
     }
     
     const pulse = Math.sin(currentEpochFloat * 10 + node.id) * 2
     const aggSize = size + 2 + (jitterScale > 1 ? pulse : 0)
     
     ctx.beginPath()
     ctx.arc(drawX, drawY, aggSize, 0, 2 * Math.PI)
     ctx.strokeStyle = `rgba(139, 92, 246, ${0.1 + (1 - epochProgress) * 0.2})`
     ctx.setLineDash([2, 2])
     ctx.stroke()
     ctx.setLineDash([])

     drawX += Math.sin(currentEpochFloat * 15 + node.id * 7.3) * jitterScale
     drawY += Math.cos(currentEpochFloat * 12 + node.id * 3.1) * jitterScale
  }

  // 2. Selection Glow
  if (isSelected) {
    ctx.beginPath()
    ctx.arc(drawX, drawY, size + 4, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(99,102,241,0.25)'
    ctx.fill()
    ctx.strokeStyle = '#6366f1'
    ctx.lineWidth = 2 / globalScale
    ctx.stroke()
  }

  // 3. GCN Wave Effect (Message passing ripples from labeled nodes)
  if (selectedModel === 'GCN') {
     // Mocking "hops" from labeled nodes using node.id % 6 for visual demo
     const hops = (node.id % 6) * 1.5
     const waveProgress = Math.max(0, 1 - Math.abs(currentEpochFloat - hops * 3) / 5)
     if (waveProgress > 0) {
        ctx.beginPath()
        ctx.arc(drawX, drawY, size + waveProgress * 6, 0, 2 * Math.PI)
        ctx.fillStyle = `rgba(255,255,255,${waveProgress * 0.4})`
        ctx.fill()
     }
  }
  
  // 4. GAT Glow Effect (Attention heat)
  if (selectedModel === 'GAT' && node.maxAttn > 0.5) {
     const pulse = Math.sin(currentEpochFloat * 4 + node.id) * 0.5 + 0.5
     const glowSize = size + 2 + pulse * node.maxAttn * 4
     ctx.beginPath()
     ctx.arc(drawX, drawY, glowSize, 0, 2 * Math.PI)
     ctx.fillStyle = `rgba(59,130,246,${0.1 + node.maxAttn * 0.3})`
     ctx.fill()
  }

  // 5. Main Node Body
  ctx.beginPath()
  ctx.arc(drawX, drawY, size, 0, 2 * Math.PI)
  ctx.fillStyle = node.color || '#94a3b8'
  ctx.fill()

  // 6. Ground Truth / Train Set Ring
  if (node.inTrainSet) {
    ctx.beginPath()
    ctx.arc(drawX, drawY, size + 2, 0, 2 * Math.PI)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1.2 / globalScale
    ctx.stroke()
  }

  // 6b. Node ID label (always visible, inside the circle)
  const fontSize = Math.max(6, Math.min(size * 0.9, 10 / Math.sqrt(globalScale)))
  ctx.font = `bold ${fontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(`${node.id}`, drawX, drawY)

  // 7. Hover/Select Label
  if (isHovered || isSelected) {
    const label = `#${node.id}`
    const fontSize = Math.max(10, 12 / globalScale)
    ctx.font = `600 ${fontSize}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = '#f1f5f9'
    ctx.fillText(label, drawX, drawY - size - 3)
  }
}
