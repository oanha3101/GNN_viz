import { useEffect, useRef } from 'react'
import {
  BookOpen,
  Database,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Network,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import ThemeToggle from '../components/ui/ThemeToggle'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import { useLanguage } from '../contexts/LanguageContext'

/* ── Aurora Background — same as landing page ── */
function AuroraBg() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      <div className="aurora-bg__cloud aurora-bg__cloud--crimson" />
      <div className="aurora-bg__cloud aurora-bg__cloud--magenta" />
      <div className="aurora-bg__cloud aurora-bg__cloud--rose" />
    </div>
  )
}

/* ── Neural Constellation Canvas ── */
function AppNeuralCanvas() {
  const canvasRef = useRef(null)
  const networkRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let time = 0
    let isDark = document.documentElement.classList.contains('dark')

    const observer = new MutationObserver(() => {
      isDark = document.documentElement.classList.contains('dark')
      performResize()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    const buildNetwork = (w, h, dark) => {
      const nodes = []
      const nodeCount = dark ? 45 : 25

      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          radius: dark ? 1.5 + Math.random() * 1.2 : 1.0 + Math.random() * 0.8,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.3 + Math.random() * 0.3,
        })
      }

      const packets = []
      const lightNodes = []
      if (dark) {
        for (let i = 0; i < 6; i++) {
          const startIdx = Math.floor(Math.random() * nodeCount)
          let targetIdx = (startIdx + 1 + Math.floor(Math.random() * (nodeCount - 1))) % nodeCount
          packets.push({
            startNodeIdx: startIdx,
            targetNodeIdx: targetIdx,
            progress: Math.random(),
            speed: 0.003 + Math.random() * 0.003,
            size: 1.5 + Math.random() * 1.0,
          })
        }
      }

      const lines = []
      const sparks = []
      if (!dark) {
        const linesCount = 12
        for (let i = 0; i < linesCount; i++) {
          lines.push({
            yOffset: (h / linesCount) * i - (h * 0.1),
            amplitude: 30 + Math.random() * 50,
            frequency: 0.002 + Math.random() * 0.002,
            phase: Math.random() * Math.PI * 2,
            speed: 0.0005 + Math.random() * 0.001,
            colorAlpha: 0.08 + Math.random() * 0.10,
            thickness: 0.75 + Math.random() * 0.7,
          })
        }
        for (let i = 0; i < 7; i++) {
          sparks.push({
            lineIndex: Math.floor(Math.random() * linesCount),
            progress: Math.random() * w,
            speed: 0.8 + Math.random() * 1.0,
            size: 1.3 + Math.random() * 1.1,
          })
        }
        for (let i = 0; i < 14; i++) {
          lightNodes.push({
            lineIndex: Math.floor(Math.random() * linesCount),
            progress: Math.random() * w,
            drift: 10 + Math.random() * 18,
            phase: Math.random() * Math.PI * 2,
            speed: 0.35 + Math.random() * 0.45,
            size: 1.4 + Math.random() * 1.4,
          })
        }
      }

      return { isDarkNetwork: dark, nodes, packets, lines, sparks, lightNodes }
    }

    const performResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      const w = rect.width
      const h = rect.height
      const dpr = window.devicePixelRatio || 1

      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      networkRef.current = buildNetwork(w, h, isDark)
    }

    performResize()
    window.addEventListener('resize', performResize)

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
      if (!net) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      const w = rect.width
      const h = rect.height
      ctx.clearRect(0, 0, w, h)
      time += 0.008

      if (net.isDarkNetwork) {
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
          for (let j = i + 1; j < net.nodes.length; j++) {
            const b = net.nodes[j]
            const dx = b.x - a.x
            const dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 140) {
              const alpha = (1 - dist / 140) * 0.12
              ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`
              ctx.lineWidth = 0.5
              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
              ctx.stroke()
            }
          }
        }

        for (const n of net.nodes) {
          const pulse = 0.6 + 0.4 * Math.sin(time * n.pulseSpeed + n.phase)
          const r = n.radius * pulse
          ctx.beginPath()
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(34, 211, 238, ${0.3 + pulse * 0.2})`
          ctx.fill()
          ctx.beginPath()
          ctx.arc(n.x, n.y, r * 2.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(34, 211, 238, ${0.03 * pulse})`
          ctx.fill()
        }

        for (const p of net.packets) {
          p.progress += p.speed
          if (p.progress > 1) {
            p.progress = 0
            p.startNodeIdx = p.targetNodeIdx
            p.targetNodeIdx = (p.targetNodeIdx + 1 + Math.floor(Math.random() * (net.nodes.length - 1))) % net.nodes.length
          }
          const start = net.nodes[p.startNodeIdx]
          const end = net.nodes[p.targetNodeIdx]
          if (!start || !end) continue
          const px = start.x + (end.x - start.x) * p.progress
          const py = start.y + (end.y - start.y) * p.progress
          ctx.beginPath()
          ctx.arc(px, py, p.size, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(34, 211, 238, 0.8)'
          ctx.fill()
          ctx.beginPath()
          ctx.arc(px, py, p.size * 3, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(34, 211, 238, 0.10)'
          ctx.fill()
        }
      } else {
        for (const line of net.lines) {
          ctx.beginPath()
          ctx.strokeStyle = `rgba(220, 38, 38, ${line.colorAlpha})`
          ctx.lineWidth = line.thickness
          for (let x = 0; x <= w; x += 3) {
            const y =
              line.yOffset +
              Math.sin(x * line.frequency + time * line.speed * 60 + line.phase) * line.amplitude +
              Math.sin(x * line.frequency * 0.5 + time * line.speed * 30) * line.amplitude * 0.3
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()

          ctx.beginPath()
          ctx.strokeStyle = `rgba(248, 113, 113, ${Math.min(line.colorAlpha * 0.65, 0.12)})`
          ctx.lineWidth = Math.max(0.4, line.thickness * 0.45)
          for (let x = 0; x <= w; x += 8) {
            const y =
              line.yOffset +
              Math.sin(x * line.frequency + time * line.speed * 60 + line.phase) * line.amplitude +
              Math.sin(x * line.frequency * 0.5 + time * line.speed * 30) * line.amplitude * 0.3
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }

        for (const spark of net.sparks) {
          spark.progress += spark.speed
          if (spark.progress > w) spark.progress = 0
          const line = net.lines[spark.lineIndex]
          if (!line) continue
          const x = spark.progress
          const y =
            line.yOffset +
            Math.sin(x * line.frequency + time * line.speed * 60 + line.phase) * line.amplitude +
            Math.sin(x * line.frequency * 0.5 + time * line.speed * 30) * line.amplitude * 0.3
          ctx.beginPath()
          ctx.arc(x, y, spark.size, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(220, 38, 38, 0.76)'
          ctx.fill()
          ctx.beginPath()
          ctx.arc(x, y, spark.size * 3, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(220, 38, 38, 0.12)'
          ctx.fill()
        }

        for (const node of net.lightNodes) {
          const line = net.lines[node.lineIndex]
          if (!line) continue
          const x = (node.progress + Math.sin(time * node.speed + node.phase) * node.drift + w) % w
          const y =
            line.yOffset +
            Math.sin(x * line.frequency + time * line.speed * 60 + line.phase) * line.amplitude +
            Math.sin(x * line.frequency * 0.5 + time * line.speed * 30) * line.amplitude * 0.3

          ctx.beginPath()
          ctx.arc(x, y, node.size * 2.6, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(248, 113, 113, 0.08)'
          ctx.fill()

          ctx.beginPath()
          ctx.arc(x, y, node.size, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(220, 38, 38, 0.52)'
          ctx.fill()
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', performResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      observer.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
    />
  )
}

const APP_NAV_ITEMS = [
  { to: '/app/dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/app/projects', key: 'nav.projects', icon: FolderKanban },
  { to: '/app/datasets', key: 'nav.datasets', icon: Database },
  { to: '/app/experiments', key: 'nav.experiments', icon: BookOpen },
  { to: '/app/lab', key: 'nav.lab', icon: Network },
]

const TITLE_KEYS = {
  '/app/dashboard': 'header.dashboard',
  '/app/projects': 'header.projects',
  '/app/profile': 'header.profile',
  '/app/datasets': 'header.datasets',
  '/app/experiments': 'header.experiments',
  '/app/lab': 'header.lab',
}

function AppNavLink({ item, t }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `app-nav-link ${isActive ? 'app-nav-link-active' : ''}`}
    >
      {({ isActive }) => (
        <>
          <span className="app-nav-link__glow" aria-hidden="true" />
          <span className={`app-nav-link__icon ${isActive ? 'app-nav-link__icon-active' : ''}`}>
            <Icon size={17} />
          </span>
          <span className="app-nav-link__label">{t(item.key)}</span>
        </>
      )}
    </NavLink>
  )
}

function getUserInitials(user, fallback) {
  const source = user?.full_name?.trim() || user?.username?.trim() || ''
  const parts = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length > 1) {
    return parts.map((part) => part[0]?.toUpperCase()).join('')
  }

  const compact = source.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2)
  return compact ? compact.toUpperCase() : fallback.slice(0, 1).toUpperCase()
}

function UserBadge({ user, navigate, t }) {
  const initials = getUserInitials(user, t('common.unknown'))

  return (
    <button
      type="button"
      onClick={() => navigate('/app/profile')}
      className="app-user-badge text-left transition-colors hover:border-line-active"
      title={user?.email || ''}
    >
      <div className="app-user-avatar">
        {user?.profile_image ? (
          <img
            src={user.profile_image}
            alt={user?.username || 'User avatar'}
            className="h-full w-full rounded-[16px] object-cover"
          />
        ) : (
          <span className="app-user-avatar-text">{initials}</span>
        )}
      </div>
      <div className="app-user-meta">
        <div className="app-user-name">
          {user?.full_name || user?.username || t('common.unknown')}
        </div>
        <div className="app-user-email" title={user?.email || ''}>
          {user?.email || t('common.none')}
        </div>
      </div>
      <span className="app-role-tag shrink-0">{user?.role || 'viewer'}</span>
    </button>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { t } = useLanguage()

  if (location.pathname === '/app/lab') {
    return <Outlet />
  }

  const titleKey = TITLE_KEYS[location.pathname]
  const titleMeta = titleKey
    ? {
        eyebrow: t(`${titleKey}.eyebrow`),
        title: t(`${titleKey}.title`),
        description: t(`${titleKey}.description`),
      }
    : null

  return (
    <div className="user-shell min-h-screen bg-abyss text-starlight selection:bg-accent-amethyst/30 print:bg-white print:text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr] print:block print:min-h-0">
        <aside className="app-sidebar print:hidden">
          <div className="relative z-10 flex h-full flex-col px-5 py-6">
            {/* Logo */}
            <div className="mb-8 flex items-center gap-3">
              <div className="app-logo-icon flex items-center justify-center">
                <Network size={22} color="#ffffff" strokeWidth={2.2} />
              </div>
              <div>
                <div className="app-brand-title">{t('brand.title')}</div>
                <div className="app-brand-subtitle">{t('brand.subtitle')}</div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="space-y-2">
              {APP_NAV_ITEMS.map((item) => (
                <AppNavLink key={item.to} item={item} t={t} />
              ))}
            </nav>

            {/* Spacer pushes user section to bottom */}
            <div className="flex-1" />

            {/* User + Actions — pinned to bottom */}
            <div className="space-y-3 border-t border-line-subtle pt-4">
              <UserBadge user={user} navigate={navigate} t={t} />

              <div className="flex flex-col gap-2">
                {user?.role === 'admin' ? (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/overview')}
                    className="app-action-btn app-action-btn-admin"
                  >
                    <ShieldCheck size={14} />
                    {t('nav.admin')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    navigate('/login', { replace: true })
                  }}
                  className="app-action-btn app-action-btn-logout"
                >
                  <LogOut size={14} />
                  {t('nav.logout')}
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="relative flex min-h-screen flex-col overflow-hidden print:min-h-0 print:overflow-visible">
          <AuroraBg />
          <AppNeuralCanvas />
          <div className="user-shell-backdrop pointer-events-none absolute inset-0 print:hidden" />

          {titleMeta ? (
            <header className="app-header flex items-start justify-between gap-4 print:hidden">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-amethyst" />
                  <span className="text-micro font-semibold uppercase tracking-ultra text-twilight">
                    {titleMeta.eyebrow}
                  </span>
                </div>
                <h1 className="mt-2 text-[2rem] font-bold tracking-tight text-white-star">
                  {titleMeta.title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-twilight">
                  {titleMeta.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <LanguageSwitcher variant="compact" />
                <ThemeToggle />
              </div>
            </header>
          ) : (
            <div className="flex justify-end gap-2 px-6 pt-6">
              <LanguageSwitcher variant="compact" />
              <ThemeToggle />
            </div>
          )}

          <main className="relative z-10 flex-1 overflow-auto p-6">
            <div className="min-h-[calc(100vh-10rem)]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
