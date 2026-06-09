import { Fragment, useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  BookOpen,
  Brain,
  CircleDot,
  Database,
  Eye,
  GitBranch,
  Layers,
  LineChart,
  Link2,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  SquareStack,
  Workflow,
  Zap,
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import { getDefaultPathForUser } from '../../utils/appRoutes'
import { useLanguage } from '../../contexts/LanguageContext'
import CountUpStat from '../../components/landing/CountUpStat'

/* ── Framer Motion variants ── */
const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
}

const fadeScale = {
  hidden: { opacity: 0, scale: 0.93, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.65, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
}

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
}

/* ── Aurora Background — animated gradient clouds ────────────── */
function AuroraBackground() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      <div className="aurora-bg__cloud aurora-bg__cloud--crimson" />
      <div className="aurora-bg__cloud aurora-bg__cloud--magenta" />
      <div className="aurora-bg__cloud aurora-bg__cloud--rose" />
    </div>
  )
}

/* ── Neural Constellation Canvas — crimson themed ────────────── */
function GraphBackgroundCanvas() {
  const canvasRef = useRef(null)
  const networkRef = useRef(null)
  const rafRef = useRef(null)
  const resizeTimeoutRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let time = 0
    let isDark = document.documentElement.classList.contains('dark')

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark')
      if (dark !== isDark) {
        isDark = dark
        performResize()
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const sampleSparkPath = (edge, progress) => {
      const clamped = Math.max(0, Math.min(1, progress))
      const segmentCount = edge.points.length - 1
      if (segmentCount <= 0) {
        return edge.points[0] || { x: 0, y: 0 }
      }

      const scaled = clamped * segmentCount
      const index = Math.min(segmentCount - 1, Math.floor(scaled))
      const localT = scaled - index
      const start = edge.points[index]
      const end = edge.points[index + 1]

      return {
        x: start.x + (end.x - start.x) * localT,
        y: start.y + (end.y - start.y) * localT,
      }
    }

    const createBlueprintPath = (points, phase = 0) => ({
      points,
      phase,
    })

    // ── NETWORK BUILDER ──
    const buildNetwork = (w, h, dark) => {
      if (dark) {
        // --- DARK MODE BUILDER ---
        const nodes = []
        const isMobile = w < 768
        const nodeCount = isMobile ? 30 : 65

        for (let i = 0; i < nodeCount; i++) {
          nodes.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.8,
            vy: (Math.random() - 0.5) * 0.8,
            radius: 2.0 + Math.random() * 1.8,
            phase: Math.random() * Math.PI * 2,
            pulseSpeed: 0.35 + Math.random() * 0.35,
          })
        }

        // Initialize packets
        const pCount = isMobile ? 5 : 10
        const packets = []
        for (let i = 0; i < pCount; i++) {
          const startIdx = Math.floor(Math.random() * nodeCount)
          let targetIdx = -1
          const candidates = []
          for (let j = 0; j < nodeCount; j++) {
            if (j === startIdx) continue
            const dx = nodes[startIdx].x - nodes[j].x
            const dy = nodes[startIdx].y - nodes[j].y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 250) candidates.push(j)
          }
          if (candidates.length > 0) {
            targetIdx = candidates[Math.floor(Math.random() * candidates.length)]
          } else {
            targetIdx = (startIdx + 1) % nodeCount
          }

          packets.push({
            startNodeIdx: startIdx,
            targetNodeIdx: targetIdx,
            progress: Math.random(),
            speed: 0.0035 + Math.random() * 0.003,
            size: 2.2 + Math.random() * 1.5,
          })
        }
        return { isDarkNetwork: true, nodes, packets }
      } else {
        // --- LIGHT MODE TOPOGRAPHIC MANIFOLD BUILDER ---
        const isMobile = w < 768
        const linesCount = isMobile ? 8 : 14
        const lines = []

        for (let i = 0; i < linesCount; i++) {
          lines.push({
            yOffset: (h / linesCount) * i - (h * 0.1),
            amplitude: 40 + Math.random() * 80,
            frequency: 0.0015 + Math.random() * 0.002,
            phase: Math.random() * Math.PI * 2,
            speed: 0.0005 + Math.random() * 0.001,
            colorAlpha: 0.04 + Math.random() * 0.12,
            thickness: 0.8 + Math.random() * 1.2,
          })
        }

        const sparks = []
        const sparkCount = isMobile ? 4 : 8
        for (let i = 0; i < sparkCount; i++) {
          sparks.push({
            lineIndex: Math.floor(Math.random() * linesCount),
            progress: Math.random() * w,
            speed: 0.8 + Math.random() * 1.5,
            size: 1.5 + Math.random() * 1.5,
          })
        }

        return { isDarkNetwork: false, lines, sparks }
      }
    }

    const performResize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const dpr = window.devicePixelRatio || 1

      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      networkRef.current = buildNetwork(width, height, isDark)
    }

    const resize = () => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
      resizeTimeoutRef.current = setTimeout(performResize, 200)
    }

    performResize()
    window.addEventListener('resize', resize)

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      } else {
        draw()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const draw = () => {
      const net = networkRef.current
      if (!net) { rafRef.current = requestAnimationFrame(draw); return }

      const w = canvas.width / (window.devicePixelRatio || 1)
      const h = canvas.height / (window.devicePixelRatio || 1)
      ctx.clearRect(0, 0, w, h)
      time += 0.008

      if (net.isDarkNetwork) {
        // --- RENDER DARK MODE ---
        for (const n of net.nodes) {
          n.x += n.vx
          n.y += n.vy

          if (n.x < 5) { n.x = 5; n.vx *= -1 }
          else if (n.x > w - 5) { n.x = w - 5; n.vx *= -1 }

          if (n.y < 5) { n.y = 5; n.vy *= -1 }
          else if (n.y > h - 5) { n.y = h - 5; n.vy *= -1 }
        }

        for (let i = 0; i < net.nodes.length; i++) {
          const a = net.nodes[i]
          let connCount = 0
          for (let j = i + 1; j < net.nodes.length; j++) {
            const b = net.nodes[j]
            const dx = b.x - a.x
            const dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (dist < 180) {
              connCount++
              if (connCount > 3) continue

              const pulse = 0.5 + 0.5 * Math.sin(time * 1.5 + (i + j))
              let baseAlpha = (1 - dist / 180) * (0.2 + pulse * 0.15)

              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
              ctx.strokeStyle = `rgba(34,211,238,${baseAlpha * 0.25})`
              ctx.lineWidth = 0.8
              ctx.stroke()

              const nx = -dy / dist
              const ny = dx / dist

              const midX1 = a.x + dx * 0.33
              const midY1 = a.y + dy * 0.33
              const midX2 = a.x + dx * 0.67
              const midY2 = a.y + dy * 0.67

              const jitterVal1 = (Math.random() - 0.5) * 6.0
              const jitterVal2 = (Math.random() - 0.5) * 6.0

              const cx1 = midX1 + nx * jitterVal1
              const cy1 = midY1 + ny * jitterVal1
              const cx2 = midX2 + nx * jitterVal2
              const cy2 = midY2 + ny * jitterVal2

              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(cx1, cy1)
              ctx.lineTo(cx2, cy2)
              ctx.lineTo(b.x, b.y)
              ctx.strokeStyle = `rgba(34,211,238,${baseAlpha * 0.85})`
              ctx.lineWidth = 1.3
              ctx.shadowBlur = 8
              ctx.shadowColor = 'rgba(34,211,238,0.8)'
              ctx.stroke()
              ctx.shadowBlur = 0

              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(cx1, cy1)
              ctx.lineTo(cx2, cy2)
              ctx.lineTo(b.x, b.y)
              ctx.strokeStyle = `rgba(165,243,252,${Math.min(1, baseAlpha * 1.8)})`
              ctx.lineWidth = 0.5
              ctx.stroke()
            }
          }
        }

        for (let i = 0; i < net.nodes.length; i++) {
          const n = net.nodes[i]
          const pulse = Math.sin(time * n.pulseSpeed + n.phase)
          const r = n.radius + pulse * 0.5

          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 6)
          grad.addColorStop(0, 'rgba(34,211,238,0.25)')
          grad.addColorStop(0.4, 'rgba(34,211,238,0.06)')
          grad.addColorStop(1, 'rgba(34,211,238,0)')
          ctx.beginPath()
          ctx.arc(n.x, n.y, r * 6, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()

          ctx.beginPath()
          ctx.arc(n.x, n.y, Math.max(1.5, r), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(34,211,238,${0.75 + pulse * 0.25})`
          ctx.shadowBlur = 10
          ctx.shadowColor = 'rgba(34,211,238,0.9)'
          ctx.fill()
          ctx.shadowBlur = 0

          ctx.beginPath()
          ctx.arc(n.x, n.y, Math.max(0.7, r * 0.4), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${0.9 + pulse * 0.1})`
          ctx.fill()
        }

        for (const p of net.packets) {
          p.progress += p.speed
          if (p.progress >= 1) {
            p.startNodeIdx = p.targetNodeIdx
            const nextCandidates = []
            for (let j = 0; j < net.nodes.length; j++) {
              if (j === p.startNodeIdx) continue
              const dx = net.nodes[p.startNodeIdx].x - net.nodes[j].x
              const dy = net.nodes[p.startNodeIdx].y - net.nodes[j].y
              const dist = Math.sqrt(dx * dx + dy * dy)
              if (dist < 180) nextCandidates.push(j)
            }
            if (nextCandidates.length > 0) {
              p.targetNodeIdx = nextCandidates[Math.floor(Math.random() * nextCandidates.length)]
            } else {
              p.targetNodeIdx = Math.floor(Math.random() * net.nodes.length)
              while (p.targetNodeIdx === p.startNodeIdx && net.nodes.length > 1) {
                p.targetNodeIdx = Math.floor(Math.random() * net.nodes.length)
              }
            }
            p.progress = 0
          }

          const a = net.nodes[p.startNodeIdx]
          const b = net.nodes[p.targetNodeIdx]
          if (!a || !b) continue

          const px = a.x + (b.x - a.x) * p.progress
          const py = a.y + (b.y - a.y) * p.progress

          ctx.beginPath()
          ctx.arc(px, py, p.size * 0.8, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.98)'
          ctx.shadowBlur = 12
          ctx.shadowColor = 'rgba(34,211,238,0.95)'
          ctx.fill()
          ctx.shadowBlur = 0

          const sparkGrad = ctx.createRadialGradient(px, py, 0, px, py, 12)
          sparkGrad.addColorStop(0, 'rgba(34,211,238,0.75)')
          sparkGrad.addColorStop(0.5, 'rgba(34,211,238,0.2)')
          sparkGrad.addColorStop(1, 'rgba(34,211,238,0)')
          ctx.beginPath()
          ctx.arc(px, py, 12, 0, Math.PI * 2)
          ctx.fillStyle = sparkGrad
          ctx.fill()

          for (let t = 1; t <= 4; t++) {
            const tp = p.progress - t * 0.025
            if (tp < 0 || tp > 1) continue
            const tx = a.x + (b.x - a.x) * tp
            const ty = a.y + (b.y - a.y) * tp
            const fade = 1 - t * 0.22
            ctx.beginPath()
            ctx.arc(tx, ty, Math.max(0.6, p.size * 0.5 - t * 0.25), 0, Math.PI * 2)
            ctx.fillStyle = `rgba(34,211,238,${0.65 * fade})`
            ctx.fill()
          }
        }

      } else {
        // --- RENDER LIGHT MODE (Electric Graph) ---
        // Clean Pearl White Background Glows
        const haze = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h))
        haze.addColorStop(0, 'rgba(255,255,255,1)')
        haze.addColorStop(1, 'rgba(248,250,252,1)') // slate-50
        ctx.fillStyle = haze
        ctx.fillRect(0, 0, w, h)

        const sideGlow = ctx.createRadialGradient(w * 0.2, h * 0.2, 0, w * 0.2, h * 0.2, Math.max(w, h) * 0.6)
        sideGlow.addColorStop(0, 'rgba(255,228,230,0.4)') // rose-100
        sideGlow.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = sideGlow
        ctx.fillRect(0, 0, w, h)

        // Draw topographic lines
        for (let i = 0; i < net.lines.length; i++) {
          const line = net.lines[i]
          line.phase += line.speed

          ctx.beginPath()
          for (let x = 0; x <= w; x += 30) {
            // Complex wave generation
            const y = line.yOffset 
              + Math.sin(x * line.frequency + line.phase) * line.amplitude
              + Math.cos(x * line.frequency * 0.5 - line.phase * 1.5) * (line.amplitude * 0.5)
              + Math.sin(x * line.frequency * 2.0 + line.phase * 0.8) * (line.amplitude * 0.2)
              + (i * 15) // Vertical spacing

            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }

          ctx.strokeStyle = `rgba(225,29,72,${line.colorAlpha})` // rose-600
          ctx.lineWidth = line.thickness
          ctx.stroke()
        }

        // Draw sparks flowing on the manifold
        for (let i = 0; i < net.sparks.length; i++) {
          const spark = net.sparks[i]
          spark.progress += spark.speed
          if (spark.progress > w + 50) {
            spark.progress = -50
            spark.lineIndex = Math.floor(Math.random() * net.lines.length)
          }

          const line = net.lines[spark.lineIndex]
          if (!line) continue

          const x = spark.progress
          const y = line.yOffset 
              + Math.sin(x * line.frequency + line.phase) * line.amplitude
              + Math.cos(x * line.frequency * 0.5 - line.phase * 1.5) * (line.amplitude * 0.5)
              + Math.sin(x * line.frequency * 2.0 + line.phase * 0.8) * (line.amplitude * 0.2)
              + (spark.lineIndex * 15)

          // Spark core
          ctx.beginPath()
          ctx.arc(x, y, spark.size, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,1)'
          ctx.shadowBlur = 8
          ctx.shadowColor = 'rgba(244,63,94,0.9)'
          ctx.fill()
          ctx.shadowBlur = 0

          // Spark glow
          const grad = ctx.createRadialGradient(x, y, 0, x, y, spark.size * 5)
          grad.addColorStop(0, 'rgba(244,63,94,0.8)')
          grad.addColorStop(1, 'rgba(244,63,94,0)')
          ctx.beginPath()
          ctx.arc(x, y, spark.size * 5, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      observer.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none z-0" />
}

/* ── Node Separation Embedding Visualization ─────────────────── */
function EmbeddingVisualization({ epoch, isRunning }) {
  const separation = Math.min(epoch / 200, 1)

  // Three clusters that separate as training progresses
  const clusters = useMemo(() => [
    { cx: 55, cy: 50, color: 'var(--aurora-crimson)', label: 'A' },
    { cx: 145, cy: 45, color: '#D946EF', label: 'B' },
    { cx: 100, cy: 105, color: '#22C55E', label: 'C' },
  ], [])

  // Stable point positions (seeded by index, not random)
  const points = useMemo(() => {
    const pts = []
    clusters.forEach((cluster, ci) => {
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + ci * 1.2
        const r = 10 + (i * 3)
        pts.push({
          bx: cluster.cx + Math.cos(angle) * r,
          by: cluster.cy + Math.sin(angle) * r,
          tx: cluster.cx + Math.cos(angle) * (r + 22),
          ty: cluster.cy + Math.sin(angle) * (r + 20),
          color: cluster.color,
          delay: i * 0.15,
        })
      }
    })
    return pts
  }, [clusters])

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
          Node Embedding Separation
        </span>
        <span className="text-[9px] font-mono" style={{ color: '#94a3b8' }}>
          Epoch {epoch}
        </span>
      </div>
      <div className="relative rounded-xl overflow-hidden" style={{
        height: '140px',
        border: '1px solid rgba(var(--aurora-crimson-rgb),0.08)',
        background: 'rgba(0,0,0,0.02)',
      }}>
        <svg className="w-full h-full" viewBox="0 0 200 130">
          {/* Cluster labels */}
          {clusters.map((c, i) => (
            <text
              key={i}
              x={c.cx + (i === 0 ? -18 : i === 1 ? 14 : 0)}
              y={c.cy - 18}
              fill={c.color}
              fontSize="7"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
              opacity={0.4 + separation * 0.4}
              textAnchor="middle"
            >
              Class {c.label}
            </text>
          ))}

          {/* Connecting lines within clusters (fade out as separation increases) */}
          {clusters.map((cluster, ci) => {
            const clusterPts = points.filter((_, idx) => Math.floor(idx / 5) === ci)
            return clusterPts.map((p, pi) => {
              if (pi === 0) return null
              const prev = clusterPts[pi - 1]
              const x1 = p.bx + (p.tx - p.bx) * separation
              const y1 = p.by + (p.ty - p.by) * separation
              const x2 = prev.bx + (prev.tx - prev.bx) * separation
              const y2 = prev.by + (prev.ty - prev.by) * separation
              return (
                <line
                  key={`line-${ci}-${pi}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={cluster.color}
                  strokeWidth="0.5"
                  opacity={0.15 * (1 - separation * 0.5)}
                />
              )
            })
          })}

          {/* Data points with animated glow */}
          {points.map((p, i) => {
            const x = p.bx + (p.tx - p.bx) * separation
            const y = p.by + (p.ty - p.by) * separation
            return (
              <g key={i}>
                {/* Glow ring */}
                <circle
                  cx={x} cy={y}
                  r={5 + separation * 2}
                  fill={p.color}
                  opacity={0.08 + separation * 0.06}
                >
                  {isRunning && (
                    <animate
                      attributeName="r"
                      values={`${4 + separation * 2};${6 + separation * 3};${4 + separation * 2}`}
                      dur={`${1.8 + p.delay}s`}
                      repeatCount="indefinite"
                    />
                  )}
                </circle>
                {/* Core dot */}
                <circle
                  cx={x} cy={y}
                  r={2.5}
                  fill={p.color}
                  opacity={0.7 + separation * 0.25}
                >
                  {isRunning && (
                    <animate
                      attributeName="opacity"
                      values={`${0.5 + separation * 0.3};${0.9};${0.5 + separation * 0.3}`}
                      dur={`${1.5 + p.delay}s`}
                      repeatCount="indefinite"
                    />
                  )}
                </circle>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

/* ── Explainability Graph Visualization ───────────────────────── */
function ExplainabilityGraph() {
  const [hoveredNode, setHoveredNode] = useState(null)

  const nodes = [
    { id: 0, x: 200, y: 120, label: 'Target', type: 'target', color: 'var(--aurora-crimson)' },
    { id: 1, x: 100, y: 60, label: 'Node 12', type: 'influential', color: '#D946EF' },
    { id: 2, x: 300, y: 60, label: 'Node 19', type: 'influential', color: '#D946EF' },
    { id: 3, x: 100, y: 180, label: 'Node 24', type: 'influential', color: '#D946EF' },
    { id: 4, x: 300, y: 180, label: 'Node 7', type: 'normal', color: '#94A3B8' },
    { id: 5, x: 200, y: 40, label: 'Node 3', type: 'normal', color: '#94A3B8' },
    { id: 6, x: 200, y: 200, label: 'Node 15', type: 'normal', color: '#94A3B8' },
  ]

  const edges = [
    { source: 0, target: 1, weight: 0.42 },
    { source: 0, target: 2, weight: 0.31 },
    { source: 0, target: 3, weight: 0.18 },
    { source: 0, target: 4, weight: 0.08 },
    { source: 0, target: 5, weight: 0.05 },
    { source: 0, target: 6, weight: 0.04 },
    { source: 1, target: 5, weight: 0.12 },
    { source: 2, target: 5, weight: 0.10 },
    { source: 3, target: 6, weight: 0.09 },
  ]

  return (
    <svg className="w-full h-full" viewBox="0 0 400 240">
      {/* Edges */}
      {edges.map((edge, idx) => {
        const s = nodes.find(n => n.id === edge.source)
        const t = nodes.find(n => n.id === edge.target)
        if (!s || !t) return null
        const isInfluential = edge.weight > 0.15
        const isHovered = hoveredNode !== null &&
          (edge.source === hoveredNode || edge.target === hoveredNode)
        return (
          <line
            key={idx}
            x1={s.x} y1={s.y}
            x2={t.x} y2={t.y}
            stroke={isHovered ? 'var(--aurora-crimson)' : isInfluential ? 'var(--aurora-magenta)' : 'var(--aurora-muted)'}
            strokeWidth={isHovered ? 2.5 : isInfluential ? 1.8 : 0.8}
            strokeOpacity={isHovered ? 0.9 : isInfluential ? 0.5 : 0.2}
            className="transition-all duration-300"
          />
        )
      })}

      {/* Edge weight labels for influential edges */}
      {edges.filter(e => e.weight > 0.15).map((edge, idx) => {
        const s = nodes.find(n => n.id === edge.source)
        const t = nodes.find(n => n.id === edge.target)
        if (!s || !t) return null
        const mx = (s.x + t.x) / 2
        const my = (s.y + t.y) / 2
        return (
          <text
            key={`label-${idx}`}
            x={mx + 8} y={my - 6}
            fill="var(--aurora-crimson)"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
            opacity="0.7"
          >
            +{edge.weight.toFixed(2)}
          </text>
        )
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const isTarget = node.type === 'target'
        const isInfluential = node.type === 'influential'
        const isHovered = hoveredNode === node.id
        return (
          <g
            key={node.id}
            className="cursor-pointer"
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            {/* Pulse ring for target node */}
            {isTarget && (
              <circle
                cx={node.x} cy={node.y}
                r={20}
                fill="none"
                stroke={node.color}
                strokeWidth={2}
                opacity={0.5}
                className="pulse-ring"
              />
            )}

            {/* Glow */}
            {(isTarget || isInfluential || isHovered) && (
              <circle
                cx={node.x} cy={node.y}
                r={isHovered ? 18 : isTarget ? 16 : 12}
                fill={node.color}
                opacity={isHovered ? 0.2 : 0.1}
                className="transition-all duration-300"
              />
            )}
            {/* Outer ring */}
            <circle
              cx={node.x} cy={node.y}
              r={isHovered ? 10 : isTarget ? 9 : 7}
              fill="rgba(7,11,20,0.6)"
              stroke={node.color}
              strokeWidth={isHovered ? 2 : isTarget ? 1.8 : 1.2}
              className="transition-all duration-300"
            />
            {/* Inner dot */}
            <circle
              cx={node.x} cy={node.y}
              r={isHovered ? 4.5 : isTarget ? 4 : 3}
              fill={node.color}
              className="transition-all duration-300"
            />
            {/* Label */}
            {isTarget && (
              <text
                x={node.x} y={node.y + 22}
                textAnchor="middle"
                fill="var(--aurora-crimson)"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
              >
                {node.label}
              </text>
            )}
          </g>
        )
      })}

      {/* Animated pulses on influential edges */}
      {edges.filter(e => e.weight > 0.15).map((edge, idx) => {
        const s = nodes.find(n => n.id === edge.source)
        const t = nodes.find(n => n.id === edge.target)
        if (!s || !t) return null
        const d = `M ${s.x} ${s.y} L ${t.x} ${t.y}`
        return (
          <circle key={`pulse-${idx}`} r="2.5" fill="var(--aurora-crimson)" opacity="0.7">
            <animateMotion
              dur={`${1.5 + idx * 0.3}s`}
              repeatCount="indefinite"
              path={d}
            />
          </circle>
        )
      })}
    </svg>
  )
}

function HeroWorkspaceGraphic({
  selectedDataset,
  selectedModel,
  epoch,
  datasetColor,
}) {
  const { t } = useLanguage()
  const taskNodes = [
    { id: 'P-101', x: 180, y: 134, cls: 'Neural Nets', tone: '#ef4444', glow: '#fb7185', role: 'target', delay: 0.1 },
    { id: 'P-018', x: 126, y: 118, cls: 'Neural Nets', tone: '#ef4444', glow: '#fb7185', role: 'support', delay: 0.55 },
    { id: 'P-044', x: 236, y: 114, cls: 'Neural Nets', tone: '#ef4444', glow: '#fb7185', role: 'support', delay: 0.75 },
    { id: 'P-209', x: 286, y: 154, cls: 'Probabilistic', tone: '#f97316', glow: '#fb923c', role: 'boundary', delay: 1.45 },
    { id: 'P-087', x: 104, y: 158, cls: 'Rule Learning', tone: '#8b5cf6', glow: '#a78bfa', role: 'contrast', delay: 1.55 },
    { id: 'P-011', x: 154, y: 178, cls: 'Neural Nets', tone: '#ef4444', glow: '#fb7185', role: 'support', delay: 1.1 },
    { id: 'P-152', x: 54, y: 116, cls: 'Case Based', tone: '#8b5cf6', glow: '#c4b5fd', role: 'ambient', delay: 1.95 },
    { id: 'P-230', x: 322, y: 108, cls: 'Theory', tone: '#0ea5e9', glow: '#7dd3fc', role: 'ambient', delay: 1.85 },
    { id: 'P-061', x: 78, y: 92, cls: 'Genetic', tone: '#14b8a6', glow: '#5eead4', role: 'ambient', delay: 1.7 },
    { id: 'P-177', x: 198, y: 78, cls: 'Neural Nets', tone: '#ef4444', glow: '#fb7185', role: 'support', delay: 0.35 },
  ]
  const taskEdges = [
    { source: 'P-101', target: 'P-018', tone: 'rgba(239,68,68,0.36)', delay: 0.25 },
    { source: 'P-101', target: 'P-044', tone: 'rgba(239,68,68,0.34)', delay: 0.45 },
    { source: 'P-101', target: 'P-011', tone: 'rgba(239,68,68,0.32)', delay: 0.75 },
    { source: 'P-101', target: 'P-209', tone: 'rgba(249,115,22,0.28)', delay: 1.1 },
    { source: 'P-101', target: 'P-087', tone: 'rgba(139,92,246,0.26)', delay: 1.2 },
    { source: 'P-018', target: 'P-177', tone: 'rgba(239,68,68,0.2)', delay: 0.55 },
    { source: 'P-044', target: 'P-230', tone: 'rgba(14,165,233,0.2)', delay: 1.35 },
    { source: 'P-011', target: 'P-152', tone: 'rgba(139,92,246,0.18)', delay: 1.65 },
    { source: 'P-018', target: 'P-061', tone: 'rgba(20,184,166,0.18)', delay: 1.45 },
    { source: 'P-087', target: 'P-209', tone: 'rgba(249,115,22,0.16)', delay: 1.85 },
    { source: 'P-011', target: 'P-087', tone: 'rgba(168,85,247,0.18)', delay: 1.5 },
  ]
  const nodeById = Object.fromEntries(taskNodes.map((node) => [node.id, node]))
  const packets = [
    { source: 'P-101', target: 'P-018', delay: 0.35, duration: 2.3, tone: '#fb7185' },
    { source: 'P-101', target: 'P-044', delay: 0.55, duration: 2.4, tone: '#fb7185' },
    { source: 'P-101', target: 'P-011', delay: 0.95, duration: 2.6, tone: '#f87171' },
    { source: 'P-101', target: 'P-209', delay: 1.2, duration: 2.9, tone: '#fb923c' },
    { source: 'P-018', target: 'P-061', delay: 1.45, duration: 2.7, tone: '#5eead4' },
    { source: 'P-044', target: 'P-230', delay: 1.55, duration: 2.8, tone: '#7dd3fc' },
  ]

  return (
    <div className="relative overflow-hidden aspect-[1/1] sm:aspect-[16/10] bg-gradient-to-br from-[#f7f7f4] via-white to-[#fff6f6] dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(var(--aurora-crimson-rgb),0.1),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(var(--aurora-crimson-rgb),0.14),transparent_30%)]" />

      <div className="relative h-full p-2.5 sm:p-3 lg:p-3.5">
        <div className="h-full rounded-[22px] border border-slate-200/85 bg-white/78 p-3 shadow-[0_20px_60px_-34px_rgba(15,23,42,0.3)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/72 sm:p-3.5 lg:p-4">
          <section className="flex h-full min-h-0 flex-col rounded-[18px] border border-slate-200/85 bg-white/92 p-3 dark:border-white/8 dark:bg-slate-950/56 sm:p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="max-w-[300px]">
                <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">
                  {t('landing.task1_title')}
                </div>
                <div className="mt-1 text-[15px] font-semibold text-slate-900 dark:text-white">
                  Task 1 topology
                </div>
                <div className="mt-1 text-[10px] leading-4.5 text-slate-600 dark:text-slate-400">
                  Node-edge structure only, with class color changes and message flow.
                </div>
              </div>

              <div className="flex flex-nowrap justify-end gap-1.5">
                {[
                  { label: selectedDataset, tone: datasetColor },
                  { label: selectedModel, tone: '#64748b' },
                  { label: 'Live Graph', tone: '#ef4444' },
                ].map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/88 px-2 py-1 text-[8px] font-medium text-slate-600 dark:border-white/8 dark:bg-white/[0.03] dark:text-slate-300"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.tone }} />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-3 flex-1 min-h-0 rounded-[20px] border border-slate-200/85 bg-gradient-to-br from-slate-50 via-white to-[#fff8f8] px-4 py-3 dark:border-white/8 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:px-4 sm:py-4">
              <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                <span>Task 1 topology</span>
                <span>Epoch {epoch}</span>
              </div>

              <div className="mt-3 relative h-[214px] sm:h-[238px]">
                <svg className="h-full w-full" viewBox="0 0 360 230">
                  <defs>
                    <radialGradient id="task-target-halo" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="rgba(239,68,68,0.28)" />
                      <stop offset="100%" stopColor="rgba(239,68,68,0)" />
                    </radialGradient>
                    <filter id="packet-glow" x="-100%" y="-100%" width="300%" height="300%">
                      <feGaussianBlur stdDeviation="2.8" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  <g transform="translate(6 -50) scale(0.88)">
                    {taskEdges.map((edge, idx) => {
                      const source = nodeById[edge.source]
                      const target = nodeById[edge.target]
                      if (!source || !target) return null
                      const isTarget = edge.source === 'P-101' || edge.target === 'P-101'
                      return (
                        <g key={`${edge.source}-${edge.target}-${idx}`}>
                          <line
                            x1={source.x}
                            y1={source.y}
                            x2={target.x}
                            y2={target.y}
                            stroke="rgba(203,213,225,0.42)"
                            strokeWidth={isTarget ? 1.6 : 1.05}
                            strokeLinecap="round"
                          />
                          <motion.line
                            x1={source.x}
                            y1={source.y}
                            x2={target.x}
                            y2={target.y}
                            stroke={edge.tone}
                            strokeWidth={isTarget ? 1.55 : 1}
                            strokeLinecap="round"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: [0, 1, 1], opacity: [0, 0.95, 0.2] }}
                            transition={{
                              duration: isTarget ? 2.5 : 2.9,
                              delay: edge.delay,
                              ease: 'easeInOut',
                              repeat: Infinity,
                              repeatDelay: 1.6,
                            }}
                          />
                        </g>
                      )
                    })}

                    {packets.map((packet) => {
                      const source = nodeById[packet.source]
                      const target = nodeById[packet.target]
                      if (!source || !target) return null
                      return (
                        <g key={`${packet.source}-${packet.target}-packet`}>
                          <motion.circle
                            cx={source.x}
                            cy={source.y}
                            r="3.4"
                            fill={packet.tone}
                            filter="url(#packet-glow)"
                            initial={{ opacity: 0, cx: source.x, cy: source.y }}
                            animate={{
                              opacity: [0, 0.95, 0],
                              cx: [source.x, target.x],
                              cy: [source.y, target.y],
                            }}
                            transition={{
                              duration: packet.duration,
                              delay: packet.delay,
                              ease: 'linear',
                              repeat: Infinity,
                              repeatDelay: 0.35,
                            }}
                          />
                          <motion.circle
                            cx={source.x}
                            cy={source.y}
                            r="1.6"
                            fill="rgba(255,255,255,0.72)"
                            initial={{ opacity: 0, cx: source.x, cy: source.y }}
                            animate={{
                              opacity: [0, 0.85, 0],
                              cx: [source.x, target.x],
                              cy: [source.y, target.y],
                            }}
                            transition={{
                              duration: packet.duration,
                              delay: packet.delay,
                              ease: 'linear',
                              repeat: Infinity,
                              repeatDelay: 0.35,
                            }}
                          />
                        </g>
                      )
                    })}

                  {taskNodes.map((node, idx) => {
                    const isTarget = node.role === 'target'
                    const isBoundary = node.role === 'boundary'
                    const baseRadius = isTarget ? 7.4 : isBoundary ? 6.1 : 5
                    return (
                      <g key={node.id}>
                        {(isTarget || isBoundary) ? (
                          <motion.circle
                            cx={node.x}
                            cy={node.y}
                            r={isTarget ? 17 : 11}
                            fill={isTarget ? 'url(#task-target-halo)' : `${node.tone}22`}
                            animate={{ opacity: [0.08, 0.28, 0.14], scale: [0.96, 1.02, 0.98] }}
                            transition={{ duration: isTarget ? 2.4 : 3.0, delay: node.delay, repeat: Infinity, repeatDelay: 1.2 }}
                            style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                          />
                        ) : null}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={baseRadius}
                          fill="rgba(226,232,240,0.88)"
                          stroke="rgba(148,163,184,0.18)"
                          strokeWidth="1"
                        />
                        <motion.circle
                          cx={node.x}
                          cy={node.y}
                          r={baseRadius}
                          fill={node.tone}
                          animate={{
                            opacity: isTarget
                              ? [0.62, 1, 0.88]
                              : isBoundary
                                ? [0.08, 0.9, 0.72]
                                : [0.06, 0.82, node.role === 'ambient' ? 0.42 : 0.68],
                            scale: isTarget ? [1, 1.03, 1] : [0.98, 1.02, 1],
                          }}
                          transition={{
                            duration: isTarget ? 1.9 : isBoundary ? 2.8 : 2.4,
                            delay: node.delay,
                            repeat: Infinity,
                            repeatDelay: 1.4,
                          }}
                          style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                        />
                        <motion.circle
                          cx={node.x}
                          cy={node.y}
                          r={isTarget ? 2.3 : 1.5}
                          fill={isTarget ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.54)'}
                          animate={{ opacity: [0.12, 0.82, 0.24] }}
                          transition={{
                            duration: isTarget ? 1.9 : 2.5,
                            delay: node.delay + 0.1,
                            repeat: Infinity,
                            repeatDelay: 1.4,
                          }}
                        />
                      </g>
                    )
                  })}
                  </g>
                </svg>

              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/* ── Main Landing Page Component ──────────────────────────────── */
export default function LandingPage() {
  const user = useAuthStore((s) => s.user)
  const { t } = useLanguage()

  const primaryCta = user
    ? { to: getDefaultPathForUser(user), label: t('landing.get_started_free') }
    : { to: '/register', label: t('landing.get_started_free') }

  // ── GNN Simulator State ──
  const [selectedDataset, setSelectedDataset] = useState('Cora')
  const [selectedModel, setSelectedModel] = useState('GraphSAGE')
  const [isRunning, setIsRunning] = useState(false)
  const [epoch, setEpoch] = useState(42)
  const [activeNode, setActiveNode] = useState(null)
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [lossHistory, setLossHistory] = useState([0.9, 0.75, 0.62, 0.51, 0.44, 0.38, 0.33, 0.29, 0.26, 0.23, 0.21, 0.19, 0.184])
  const [accHistory, setAccHistory] = useState([0.35, 0.48, 0.58, 0.68, 0.74, 0.79, 0.83, 0.86, 0.88, 0.89, 0.90, 0.91, 0.924])

  const MODEL_PARAMS = {
    'GraphSAGE': { hidden: 128, layers: 2, agg: 'mean' },
    'GCN': { hidden: 64, layers: 3, agg: 'add' },
    'GAT': { hidden: 32, layers: 2, agg: 'concat (8 heads)' },
  }

  const DATASET_PARAMS = {
    'Cora': { color: 'var(--aurora-crimson)', type: 'Citation Graph' },
    'CiteSeer': { color: 'var(--aurora-magenta)', type: 'Academic Network' },
    'PubMed': { color: 'var(--aurora-success)', type: 'Bio-Medical Graph' },
  }

  const simulationNodes = [
    { id: 0, x: 250, y: 170, label: 'Core Node', type: 'hub', color: DATASET_PARAMS[selectedDataset].color },
    { id: 1, x: 130, y: 80, label: 'Feature A', type: 'leaf', color: '#D946EF' },
    { id: 2, x: 370, y: 80, label: 'Feature B', type: 'leaf', color: '#D946EF' },
    { id: 3, x: 110, y: 220, label: 'Feature C', type: 'leaf', color: '#F472B6' },
    { id: 4, x: 390, y: 220, label: 'Feature D', type: 'leaf', color: '#F472B6' },
    { id: 5, x: 250, y: 60, label: 'Feature E', type: 'leaf', color: '#FF5C8A' },
    { id: 6, x: 250, y: 280, label: 'Feature F', type: 'leaf', color: '#22C55E' },
    { id: 7, x: 185, y: 130, label: 'Feature G', type: 'mid', color: '#94A3B8' },
    { id: 8, x: 315, y: 130, label: 'Feature H', type: 'mid', color: '#94A3B8' },
    { id: 9, x: 250, y: 220, label: 'Feature I', type: 'mid', color: DATASET_PARAMS[selectedDataset].color },
  ]

  const simulationEdges = [
    { source: 0, target: 1 }, { source: 0, target: 2 }, { source: 0, target: 3 },
    { source: 0, target: 4 }, { source: 0, target: 5 }, { source: 0, target: 6 },
    { source: 0, target: 7 }, { source: 0, target: 8 }, { source: 0, target: 9 },
    { source: 1, target: 5 }, { source: 2, target: 5 }, { source: 3, target: 6 },
    { source: 4, target: 6 }, { source: 7, target: 9 }, { source: 8, target: 9 },
  ]

  // Simulation animation
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      setEpoch(prev => {
        if (prev >= 200) { setIsRunning(false); return 200 }
        const nextEpoch = prev + 2
        setLossHistory(lh => {
          const base = 0.82 * Math.exp(-nextEpoch / 65) + 0.12
          const noise = Math.random() * 0.015
          return [...lh.slice(-18), parseFloat((base + noise).toFixed(3))]
        })
        setAccHistory(ah => {
          const base = 0.35 + 0.58 * (1 - Math.exp(-nextEpoch / 55))
          const noise = Math.random() * 0.01
          return [...ah.slice(-18), parseFloat((base + noise).toFixed(3))]
        })
        return nextEpoch
      })
    }, 85)
    return () => clearInterval(interval)
  }, [isRunning])

  const handleStartStop = () => {
    if (isRunning) {
      setIsRunning(false)
    } else {
      setLossHistory([0.94]); setAccHistory([0.33]); setEpoch(0); setIsRunning(true)
    }
  }

  const getPolylinePoints = (history, width, height, minVal, maxVal) => {
    if (!history || history.length === 0) return '0,0'
    if (history.length === 1) return `0,${height} ${width},${height}`
    return history.map((val, idx) => {
      const x = (idx / (history.length - 1)) * width
      const normalized = (val - minVal) / ((maxVal - minVal) || 1)
      const clamped = Math.max(0, Math.min(1, normalized))
      const y = height - clamped * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  const stats = [
    { value: '4', label: t('landing.stat_tasks') },
    { value: '3', label: t('landing.stat_encoders') },
    { value: '∞', label: t('landing.stat_replay') },
    { value: '100%', label: t('landing.stat_audit') },
  ]

  const tasks = [
    { icon: CircleDot, title: t('landing.task_node_title'), desc: t('landing.task_node_desc') },
    { icon: Link2, title: t('landing.task_link_title'), desc: t('landing.task_link_desc') },
    { icon: SquareStack, title: t('landing.task_graph_title'), desc: t('landing.task_graph_desc') },
    { icon: Eye, title: t('landing.task_xai_title'), desc: t('landing.task_xai_desc') },
  ]

  const gnnSteps = [
    { icon: Network, title: t('landing.how_input'), desc: t('landing.how_input_desc'), formula: null },
    { icon: Zap, title: t('landing.how_message'), desc: t('landing.how_message_desc'), formula: null },
    { icon: Layers, title: t('landing.how_agg'), desc: t('landing.how_agg_desc'), formula: t('landing.how_formula_agg') },
    { icon: Brain, title: t('landing.how_update'), desc: t('landing.how_update_desc'), formula: t('landing.how_formula_update') },
    { icon: LineChart, title: t('landing.how_predict'), desc: t('landing.how_predict_desc'), formula: t('landing.how_formula_predict') },
  ]

  const pipelineSteps = [
    { icon: Database, title: t('landing.pipeline_dataset'), desc: t('landing.pipeline_dataset_desc') },
    { icon: Workflow, title: t('landing.pipeline_preprocess'), desc: t('landing.pipeline_preprocess_desc') },
    { icon: Network, title: t('landing.pipeline_construct'), desc: t('landing.pipeline_construct_desc') },
    { icon: Activity, title: t('landing.pipeline_train'), desc: t('landing.pipeline_train_desc') },
    { icon: Search, title: t('landing.pipeline_xai'), desc: t('landing.pipeline_xai_desc') },
    { icon: LineChart, title: t('landing.pipeline_eval'), desc: t('landing.pipeline_eval_desc') },
  ]

  return (
    <div className="relative">
      {/* ── AURORA BACKGROUND ─────────────────────────────────── */}
      <AuroraBackground />
      <GraphBackgroundCanvas />

      {/* ── HERO SECTION ──────────────────────────────────────── */}
      <section className="landing-section">
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-16 lg:pt-28 lg:pb-20">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr] items-center gap-12 lg:gap-16">

            {/* Left column */}
            <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
              <motion.span variants={fadeUp} className="landing-eyebrow">
                <Sparkles size={12} className="animate-pulse shimmer-text" />
                <span className="shimmer-text">{t('landing.eyebrow')}</span>
              </motion.span>

              <motion.h1
                variants={fadeUp}
                className="mt-6 landing-hero-title"
              >
                {t('landing.hero_title_a')}
                <br />
                <span className="landing-highlight">{t('landing.hero_title_b')}</span>
                <br />
                <span className="opacity-70" style={{ fontSize: 'clamp(30px, 3.8vw, 50px)' }}>
                  {t('landing.hero_title_c')}
                </span>
              </motion.h1>

              <motion.p variants={fadeUp} className="mt-2 text-lg font-semibold" style={{
                background: 'var(--aurora-gradient)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: 'clamp(16px, 1.8vw, 22px)',
              }}>
                {t('landing.hero_title_sub')}
              </motion.p>

              <motion.p variants={fadeUp} className="mt-4 landing-hero-subtitle">
                {t('landing.hero_subtitle')}
              </motion.p>

              {/* CTA buttons */}
              <motion.div variants={fadeUp} className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to={primaryCta.to} className="landing-btn-primary magnetic-hover glow-effect group">
                  {primaryCta.label}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link to="/about" className="landing-btn-ghost">
                  {t('landing.see_how')}
                </Link>
              </motion.div>

              {/* Trust badges — 3 only */}
              <motion.div variants={fadeUp} className="mt-6 text-xs flex flex-wrap items-center gap-x-5 gap-y-2" style={{ color: '#94a3b8' }}>
                {[
                  { icon: ShieldCheck, label: t('landing.trust_xai') },
                  { icon: Activity, label: t('landing.trust_tracking') },
                  { icon: GitBranch, label: t('landing.trust_repro') },
                ].map((badge) => (
                  <span key={badge.label} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 border" style={{
                    borderColor: 'rgba(var(--aurora-crimson-rgb),0.12)',
                    background: 'rgba(var(--aurora-crimson-rgb),0.04)',
                    backdropFilter: 'blur(4px)',
                  }}>
                    <badge.icon size={13} style={{ color: 'var(--aurora-crimson)' }} />
                    {badge.label}
                  </span>
                ))}
              </motion.div>
            </motion.div>

            {/* Right column — High fidelity glassmorphic browser mockup of GNN-Insight */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="relative">
                {/* Glowing backdrop */}
                <div className="absolute -inset-4 rounded-3xl blur-3xl pointer-events-none opacity-60" style={{
                  background: 'linear-gradient(135deg, rgba(var(--aurora-crimson-rgb),0.12), transparent, rgba(var(--aurora-magenta-rgb),0.08))',
                }} />

                {/* Browser window */}
                <motion.div variants={fadeScale} className="relative rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white/40 dark:bg-slate-900/60 backdrop-blur-md shadow-2xl transition-all duration-500 hover:scale-[1.015] hover:border-slate-300 dark:hover:border-slate-700/80">
                  {/* Title Bar */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-100/50 dark:bg-slate-950/40 border-b border-slate-200/50 dark:border-white/5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] inline-block" />
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 select-none tracking-wider">
                      task1-node-classification.app
                    </div>
                    <div className="w-10" />
                  </div>

                  {/* Research graphic container */}
                  <div className="relative overflow-hidden aspect-[1/1] sm:aspect-[16/10]">
                    <HeroWorkspaceGraphic
                      selectedDataset={selectedDataset}
                      selectedModel={selectedModel}
                      epoch={epoch}
                      datasetColor={DATASET_PARAMS[selectedDataset].color}
                    />
                    {/* Subtle glass reflection overlay */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
                  </div>
                </motion.div>

                {/* Hero Spotlight */}
                <div className="hero-spotlight" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ───────────────────────────────────────── */}
      <section className="landing-section mx-auto max-w-7xl px-6 -mt-6">
        <motion.div
          className="landing-card !p-8 md:!p-10 grid grid-cols-2 md:grid-cols-4 gap-8 hover:!transform-none"
          style={{ borderTop: '2px solid var(--aurora-crimson)' }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
        >
          {stats.map((s, idx) => (
            <motion.div
              key={s.label}
              variants={fadeScale}
              custom={idx}
            >
              <CountUpStat
                value={s.value}
                label={s.label}
                duration={2000}
                isInfinite={s.value === '∞'}
                isPercentage={typeof s.value === 'string' && s.value.includes('%')}
              />
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── RESEARCH CAPABILITIES (2x2) ───────────────────────── */}
      <section className="landing-section mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <motion.div
          className="max-w-2xl"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
        >
          <motion.span variants={fadeUp} className="landing-eyebrow">
            <Network size={12} className="animate-spin-slow" /> {t('landing.capabilities')}
          </motion.span>
          <motion.h2 variants={fadeUp} className="mt-4 landing-section-title">
            {t('landing.capabilities_title')}
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 landing-section-sub">
            {t('landing.capabilities_sub')}
          </motion.p>
        </motion.div>

        <motion.div
          className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
        >
          {tasks.map((task) => {
            const Icon = task.icon
            return (
              <motion.div
                key={task.title}
                className="landing-card landing-card-accent glow-effect corner-accent"
                variants={fadeScale}
                whileHover={{ y: -6, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
              >
                <div className="landing-card-icon glow-effect">
                  <Icon size={18} />
                </div>
                <div className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-4">
                  {task.title}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {task.desc}
                </p>
              </motion.div>
            )
          })}
        </motion.div>
      </section>

      {/* ── HOW GNN LEARNS ────────────────────────────────────── */}
      <section className="landing-section mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <motion.div
          className="max-w-2xl"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
        >
          <motion.span variants={fadeUp} className="landing-eyebrow">
            <Brain size={12} /> {t('landing.how_title')}
          </motion.span>
          <motion.h2 variants={fadeUp} className="mt-4 landing-section-title">
            {t('landing.how_title')}
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 landing-section-sub">
            {t('landing.how_sub')}
          </motion.p>
        </motion.div>

        <motion.div
          className="mt-12 flex flex-col lg:flex-row items-stretch gap-6 lg:gap-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
        >
          {gnnSteps.map((step, i) => {
            const Icon = step.icon
            return (
              <div key={step.title} className="contents">
                <motion.div
                  className="gnn-flow-step flex-1 relative"
                  variants={fadeScale}
                  custom={i}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center glow-effect" style={{
                      background: 'rgba(var(--aurora-crimson-rgb),0.08)',
                      border: '1px solid rgba(var(--aurora-crimson-rgb),0.15)',
                    }}>
                      <Icon size={16} style={{ color: 'var(--aurora-crimson)' }} />
                    </div>
                    <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--aurora-crimson)' }}>
                      0{i + 1}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {step.title}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {step.desc}
                  </p>
                  {step.formula && (
                    <div className="gnn-flow-step__formula">
                      {step.formula}
                    </div>
                  )}

                  {/* Timeline connector */}
                  {i < gnnSteps.length - 1 && (
                    <div className="timeline-connector" />
                  )}
                </motion.div>
              </div>
            )
          })}
        </motion.div>
      </section>

      {/* ── EXPLAINABILITY SHOWCASE ────────────────────────────── */}
      <section id="pipeline" className="landing-section mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <motion.div
          className="max-w-2xl"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
        >
          <motion.span variants={fadeUp} className="landing-eyebrow">
            <Eye size={12} /> {t('landing.xai_title')}
          </motion.span>
          <motion.h2 variants={fadeUp} className="mt-4 landing-section-title">
            {t('landing.xai_title')}
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 landing-section-sub">
            {t('landing.xai_sub')}
          </motion.p>
        </motion.div>

        <motion.div
          className="mt-12 grid lg:grid-cols-2 gap-6"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
        >
          {/* Left — Interactive Graph */}
          <motion.div variants={fadeScale} className="xai-panel">
            <div className="xai-panel__header">
              <div className="h-2 w-2 rounded-full" style={{ background: 'var(--aurora-crimson)' }} />
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                Graph Explanation View
              </span>
            </div>
            <div className="p-6 flex items-center justify-center" style={{ minHeight: '280px' }}>
              <ExplainabilityGraph />
            </div>
          </motion.div>

          {/* Right — Explanation Panel */}
          <motion.div variants={fadeScale} className="xai-panel">
            <div className="xai-panel__header">
              <Search size={14} style={{ color: 'var(--aurora-crimson)' }} />
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                Explanation Panel
              </span>
            </div>
            <div className="p-6 space-y-6">
              {/* Prediction */}
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>
                  {t('landing.xai_prediction')}
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('landing.xai_paper_cat')}</span>
                  <span className="text-sm font-mono" style={{ color: '#22C55E' }}>
                    {t('landing.xai_confidence')}: 92.4%
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full" style={{
                    width: '92.4%',
                    background: 'var(--aurora-gradient)',
                    transition: 'width 1s ease',
                  }} />
                </div>
              </div>

              {/* Influential Neighbors */}
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>
                  {t('landing.xai_neighbors')}
                </div>
                <div className="space-y-2">
                  {[
                    { id: 'Node 12', weight: 0.42, color: '#D946EF' },
                    { id: 'Node 19', weight: 0.31, color: '#D946EF' },
                    { id: 'Node 24', weight: 0.18, color: '#D946EF' },
                  ].map((n) => (
                    <div key={n.id} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{
                      background: 'rgba(var(--aurora-crimson-rgb),0.04)',
                      border: '1px solid rgba(var(--aurora-crimson-rgb),0.08)',
                    }}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: n.color }} />
                        <span className="text-sm font-mono text-slate-800 dark:text-slate-100">{n.id}</span>
                      </div>
                      <span className="text-xs font-mono font-semibold" style={{ color: 'var(--aurora-crimson)' }}>
                        +{n.weight.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Features */}
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>
                  {t('landing.xai_features')}
                </div>
                <div className="space-y-3">
                  {[
                    { name: 'Citation Count', value: 0.42, pct: 84 },
                    { name: 'Keyword Similarity', value: 0.31, pct: 62 },
                    { name: 'Publication Year', value: 0.18, pct: 36 },
                  ].map((f) => (
                    <div key={f.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs" style={{ color: '#94a3b8' }}>{f.name}</span>
                        <span className="text-xs font-mono font-semibold" style={{ color: 'var(--aurora-crimson)' }}>
                          +{f.value.toFixed(2)}
                        </span>
                      </div>
                      <div className="xai-feature-bar">
                        <div className="xai-feature-bar__fill" style={{ width: `${f.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── RESEARCH PIPELINE ─────────────────────────────────── */}
      <section id="datasets" className="landing-section mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <motion.div
          className="text-center max-w-3xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
        >
          <motion.span variants={fadeUp} className="landing-eyebrow justify-center mx-auto">
            <Workflow size={12} /> {t('landing.pipeline_title')}
          </motion.span>
          <motion.h2 variants={fadeUp} className="mt-4 landing-section-title">
            {t('landing.pipeline_title')}
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 landing-section-sub mx-auto">
            {t('landing.pipeline_sub')}
          </motion.p>
        </motion.div>

        <motion.div
          className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
        >
          {pipelineSteps.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.title}
                className="pipeline-card glow-effect corner-accent"
                variants={fadeScale}
                custom={i}
                whileHover={{ y: -6, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
              >
                <div className="pipeline-card__dot glow-effect">
                  <Icon size={20} />
                </div>
                <div className="flex-1 w-full">
                  <div className="flex items-center justify-between mb-2 w-full">
                    <span className="text-[11px] font-mono font-bold tracking-wider" style={{ color: 'var(--aurora-crimson)' }}>
                      STEP 0{i + 1}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {step.desc}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────── */}
      <section className="landing-section mx-auto max-w-7xl px-6 pt-24 lg:pt-32 pb-20 lg:pb-28">
        <motion.div
          className="landing-cta"
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative z-10 px-8 py-14 md:px-16 md:py-18 flex flex-col items-center text-center gap-8">
            <div className="max-w-3xl">
              <h2 className="text-2xl md:text-4xl font-bold tracking-tight" style={{ color: '#F8FAFC' }}>
                {t('landing.cta_title')}
              </h2>
              <p className="mt-4 text-sm md:text-base max-w-2xl mx-auto" style={{ color: 'rgba(248,250,252,0.7)' }}>
                {t('landing.cta_sub')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full">
              <Link to={primaryCta.to} className="landing-btn-primary w-full sm:w-auto justify-center">
                {primaryCta.label}
                <ArrowRight size={16} />
              </Link>
              <a
                href="https://github.com/oanha3101/GNN_viz"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all w-full sm:w-auto active:scale-95"
                style={{
                  border: '1px solid rgba(var(--aurora-crimson-rgb),0.35)',
                  color: '#F8FAFC',
                  background: 'rgba(var(--aurora-crimson-rgb),0.08)',
                }}
              >
                <BookOpen size={16} style={{ color: 'var(--aurora-crimson)' }} />
                {t('landing.cta_docs')}
              </a>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  )
}
