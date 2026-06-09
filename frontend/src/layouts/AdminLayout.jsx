import { useEffect, useRef } from 'react'
import { Activity, ArrowRight, Database, FileClock, FolderKanban, LogOut, Moon, Shield, Sparkles, SunMedium, Users } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { useTheme } from '../contexts/ThemeContext'
import { useLanguage } from '../contexts/LanguageContext'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'

const ADMIN_NAV_ITEMS = [
  { to: '/admin/overview', key: 'admin.overview', icon: Shield },
  { to: '/admin/users', key: 'admin.users', icon: Users },
  { to: '/admin/projects', key: 'admin.projects', icon: FolderKanban },
  { to: '/admin/datasets', key: 'admin.datasets', icon: Database },
  { to: '/admin/experiments', key: 'admin.experiments', icon: FolderKanban },
  { to: '/admin/sessions', key: 'admin.sessions', icon: Activity },
  { to: '/admin/retention', key: 'admin.retention', icon: Shield },
  { to: '/admin/audit', key: 'admin.audit', icon: FileClock },
]

const TITLE_KEYS = {
  '/admin/overview': 'admin.headers.overview',
  '/admin/users': 'admin.headers.users',
  '/admin/projects': 'admin.headers.projects',
  '/admin/datasets': 'admin.headers.datasets',
  '/admin/experiments': 'admin.headers.experiments',
  '/admin/sessions': 'admin.headers.sessions',
  '/admin/retention': 'admin.headers.retention',
  '/admin/audit': 'admin.headers.audit',
}

function AdminNavLink({ item, t }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `admin-nav-link ${isActive ? 'admin-nav-link-active' : ''}`
      }
    >
      <Icon size={15} />
      <span className="font-medium">{t(item.key)}</span>
    </NavLink>
  )
}

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
      className="app-neural-canvas pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-70"
    />
  )
}

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { theme, toggleTheme } = useTheme()
  const { t } = useLanguage()
  const titleKey = TITLE_KEYS[location.pathname] || TITLE_KEYS['/admin/overview']
  const titleMeta = {
    eyebrow: t(`${titleKey}.eyebrow`),
    title: t(`${titleKey}.title`),
    description: t(`${titleKey}.description`),
  }

  return (
    <div className={`admin-shell admin-theme-${theme} min-h-screen bg-abyss text-starlight`}>
      <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
        {/* ── Sidebar ── */}
        <aside className="app-sidebar admin-sidebar lg:sticky lg:top-0 lg:h-screen">
          {/* Amber-tinted particles */}
          <div className="sidebar-cosmos">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="sidebar-particle admin-particle"
                style={{
                  '--px': `${10 + Math.random() * 80}%`,
                  '--py': `${Math.random() * 100}%`,
                  '--ps': `${Math.random() * 2.5 + 0.8}px`,
                  '--pdur': `${Math.random() * 8 + 5}s`,
                  '--pdel': `${Math.random() * -8}s`,
                }}
              />
            ))}
            {/* Subtle constellation lines */}
            <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none">
              <line x1="20%" y1="15%" x2="70%" y2="30%" stroke="rgba(251,191,36,0.12)" strokeWidth="0.5" />
              <line x1="70%" y1="30%" x2="40%" y2="55%" stroke="rgba(251,191,36,0.1)" strokeWidth="0.5" />
              <line x1="40%" y1="55%" x2="80%" y2="75%" stroke="rgba(251,191,36,0.08)" strokeWidth="0.5" />
            </svg>
          </div>

          <div className="relative z-10 flex h-full min-h-0 flex-col px-4 py-5">
            {/* Logo */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="app-logo-icon admin-logo-icon">
                  <Shield size={16} className="admin-logo-mark" />
                </div>
                <div>
                  <div className="admin-brand-title text-[11px] font-bold uppercase tracking-[0.2em]">{t('admin.brand_title')}</div>
                  <div className="admin-brand-subtitle text-[9px] text-text-shadow">{t('admin.brand_subtitle')}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleTheme()}
                className="admin-theme-toggle"
                aria-label={theme === 'dark' ? t('theme.switch_to_light') : t('theme.switch_to_dark')}
                title={theme === 'dark' ? t('theme.switch_to_light') : t('theme.switch_to_dark')}
              >
                {theme === 'dark' ? <SunMedium size={14} /> : <Moon size={14} />}
              </button>
            </div>

            {/* Nav */}
            <nav className="admin-scrollbar mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {ADMIN_NAV_ITEMS.map((item) => (
                <AdminNavLink key={item.to} item={item} t={t} />
              ))}
            </nav>

            {/* User + Actions */}
            <div className="admin-sidebar-footer mt-auto space-y-2 border-t border-line-subtle/70 pt-4">
              <div className="app-user-badge admin-user-badge">
                <div className="app-user-avatar admin-user-avatar">
                  <span className="admin-avatar-mark text-sm font-bold">
                    {(user?.username || 'A')[0].toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="admin-sidebar-user-name text-xs font-semibold truncate">{user?.username || t('nav.admin')}</div>
                  <div className="admin-sidebar-user-email text-[10px] truncate">{user?.email || t('admin.no_email')}</div>
                </div>
                <span className="app-role-tag admin-role-tag">
                  {user?.role || 'admin'}
                </span>
              </div>

              <div className="pt-1">
                <LanguageSwitcher size="sm" className="admin-language-switcher w-full justify-center" />
              </div>

              <div className="space-y-1">
                <button
                  onClick={() => navigate('/app/dashboard')}
                  className="app-action-btn admin-action-btn w-full"
                >
                  <ArrowRight size={13} /> {t('admin.research_shell')}
                </button>
                <button
                  onClick={() => {
                    logout()
                    navigate('/login', { replace: true })
                  }}
                  className="app-action-btn app-action-btn-logout w-full"
                >
                  <LogOut size={13} /> {t('nav.logout')}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Area ── */}
        <div className="relative flex min-h-screen flex-col overflow-hidden print:min-h-0 print:overflow-visible">
          <AuroraBg />
          <AppNeuralCanvas />

          {/* Header */}
          <header className="app-header admin-header">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="admin-eyebrow-icon" />
                  <span className="text-micro font-semibold uppercase tracking-ultra admin-eyebrow">{titleMeta.eyebrow}</span>
                </div>
                <h1 className="admin-page-title mt-1.5 text-xl font-black text-white-star">{titleMeta.title}</h1>
                <p className="admin-page-subtitle mt-1 max-w-2xl text-xs leading-5 text-twilight">{titleMeta.description}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleTheme()}
                className="admin-theme-toggle admin-theme-toggle-header"
              >
                {theme === 'dark' ? <SunMedium size={14} /> : <Moon size={14} />}
                <span>{theme === 'dark' ? t('theme.light_mode') : t('theme.dark_mode')}</span>
              </button>
            </div>
          </header>

          {/* Content */}
          <main className="relative z-10 flex-1 p-6">
            <div className="min-h-[calc(100vh-9rem)]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
