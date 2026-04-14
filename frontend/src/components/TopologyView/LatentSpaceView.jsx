import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import usePlayerStore from '../../store/playerStore'

/**
 * LatentSpaceView — Latent space visualization for Task 6 (Graph Generation)
 * Features: Canvas scatter plot, click to select 2 endpoints, interpolation slider
 */
export default function LatentSpaceView() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ width: 400, height: 300 })
  const [selectedPts, setSelectedPts] = useState([]) // max 2 indices
  const [interpT, setInterpT] = useState(0.5)
  const latentPoints = snap?.latent_points || []
  const latentPointScores = snap?.latent_point_scores || []
  const latentPointValidity = snap?.latent_point_validity || []

  // Responsive
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Scaling helpers with auto-scale and padding
  const scaleInfo = useMemo(() => {
    if (latentPoints.length === 0) return null
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    latentPoints.forEach(([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    })
    
    // Add 15% padding to prevent points from touching edges
    const pad = 25
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const paddingX = rangeX * 0.15
    const paddingY = rangeY * 0.15
    
    // Expand bounds to include padding
    minX -= paddingX
    maxX += paddingX
    minY -= paddingY
    maxY += paddingY
    
    const finalRangeX = maxX - minX
    const finalRangeY = maxY - minY
    
    return { minX, maxX, minY, maxY, rangeX: finalRangeX, rangeY: finalRangeY, pad }
  }, [latentPoints])

  const toCanvas = useCallback((pt) => {
    if (!scaleInfo) return [0, 0]
    const { minX, rangeX, minY, rangeY, pad } = scaleInfo
    return [
      pad + ((pt[0] - minX) / rangeX) * (dims.width - pad * 2),
      pad + ((pt[1] - minY) / rangeY) * (dims.height - pad * 2),
    ]
  }, [scaleInfo, dims])

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !scaleInfo) return
    const ctx = canvas.getContext('2d')
    const { width, height } = dims
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    // Draw all latent points
    latentPoints.forEach((pt, i) => {
      const [cx, cy] = toCanvas(pt)
      const isSelected = selectedPts.includes(i)
      const score = latentPointScores[i] ?? 0.5
      const isValid = (latentPointValidity[i] ?? 0) >= 0.5
      const radius = 3 + score * 4

      // Selection glow
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(cx, cy, 10 + score * 3, 0, 2 * Math.PI)
        ctx.fillStyle = 'rgba(99, 102, 241, 0.2)'
        ctx.fill()
        ctx.strokeStyle = '#6366f1'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.arc(cx, cy, isSelected ? radius + 1.5 : radius, 0, 2 * Math.PI)
      ctx.fillStyle = isSelected
        ? '#a5b4fc'
        : isValid
          ? `rgba(34, 197, 94, ${0.45 + score * 0.45})`
          : `rgba(248, 113, 113, ${0.4 + score * 0.5})`
      ctx.fill()
    })

    // Draw interpolation line between 2 selected points
    if (selectedPts.length === 2) {
      const [aIdx, bIdx] = selectedPts
      const [ax, ay] = toCanvas(latentPoints[aIdx])
      const [bx, by] = toCanvas(latentPoints[bIdx])

      // Dashed line
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.setLineDash([])

      // Interpolated point
      const ix = ax + (bx - ax) * interpT
      const iy = ay + (by - ay) * interpT
      ctx.beginPath()
      ctx.arc(ix, iy, 6, 0, 2 * Math.PI)
      ctx.fillStyle = '#f97316'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Labels
      ctx.fillStyle = '#3b82f6'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('A', ax, ay - 14)
      ctx.fillText('B', bx, by - 14)
      ctx.fillStyle = '#f97316'
      ctx.fillText(`z (t=${interpT.toFixed(2)})`, ix, iy - 14)
    }

    // Title
    ctx.fillStyle = '#94a3b8'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`Latent Space — Epoch ${epochInt}`, scaleInfo.pad, 28)

  }, [latentPoints, latentPointScores, latentPointValidity, dims, selectedPts, interpT, epochInt, scaleInfo, toCanvas])

  // Handle clicks for point selection
  const handleClick = useCallback((e) => {
    if (!scaleInfo || latentPoints.length === 0) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    // Find closest point
    let closestIdx = -1, closestDist = 20
    latentPoints.forEach((pt, i) => {
      const [cx, cy] = toCanvas(pt)
      const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
      if (d < closestDist) { closestDist = d; closestIdx = i }
    })

    if (closestIdx === -1) return

    setSelectedPts(prev => {
      if (prev.includes(closestIdx)) return prev.filter(x => x !== closestIdx)
      if (prev.length >= 2) return [prev[1], closestIdx]
      return [...prev, closestIdx]
    })
  }, [latentPoints, scaleInfo, toCanvas])

  if (latentPoints.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
        <div className="text-center">
          <div className="text-3xl mb-2 opacity-40">🌌</div>
          <p>Latent space will appear during training</p>
        </div>
      </div>
    )
  }

  const selectedMeta = selectedPts.map((idx) => ({
    idx,
    score: latentPointScores[idx] ?? 0,
    valid: (latentPointValidity[idx] ?? 0) >= 0.5,
  }))

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: dims.width, height: dims.height, cursor: 'crosshair' }}
        className="absolute inset-0"
        onClick={handleClick}
      />

      <div className="absolute top-2 right-2 z-10 bg-slate-900/85 border border-slate-700/40 rounded-xl px-3 py-2 text-[9px] text-slate-300">
        <div className="text-slate-500 uppercase tracking-wider mb-1">Latent Quality</div>
        <div className="flex items-center gap-3">
          <span className="text-green-400">Valid {(latentPointValidity.filter(v => v >= 0.5).length / Math.max(1, latentPoints.length) * 100).toFixed(0)}%</span>
          <span className="text-orange-400">Mean {(latentPointScores.reduce((sum, v) => sum + v, 0) / Math.max(1, latentPointScores.length)).toFixed(2)}</span>
        </div>
      </div>

      {/* Interpolation slider */}
      {selectedPts.length === 2 && (
        <div className="absolute bottom-3 left-3 right-3 z-10 bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2 border border-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-blue-400 font-bold">A</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={interpT}
              onChange={(e) => setInterpT(parseFloat(e.target.value))}
              className="flex-1 h-1 accent-orange-500"
            />
            <span className="text-[9px] text-blue-400 font-bold">B</span>
            <span className="text-[9px] text-orange-400 font-mono w-8">{interpT.toFixed(2)}</span>
          </div>
          <p className="text-[7px] text-slate-600 mt-0.5">
            Drag to interpolate between latent points.
            A {selectedMeta[0]?.valid ? 'valid' : 'risky'} {selectedMeta[0]?.score.toFixed(2)}.
            B {selectedMeta[1]?.valid ? 'valid' : 'risky'} {selectedMeta[1]?.score.toFixed(2)}.
          </p>
        </div>
      )}

      {/* Hint */}
      {selectedPts.length < 2 && (
        <div className="absolute bottom-2 left-2 z-10 text-[8px] text-slate-600 italic">
          Click 2 points to enable interpolation
        </div>
      )}
    </div>
  )
}
