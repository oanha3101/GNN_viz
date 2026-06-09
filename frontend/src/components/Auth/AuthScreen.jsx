import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Database,
  KeyRound,
  LockKeyhole,
  Network,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import { useLanguage } from '../../contexts/LanguageContext'
import LanguageSwitcher from '../ui/LanguageSwitcher'

const MotionLink = motion(Link)

/* ── Google "G" SVG ── */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 2.58z" fill="#EA4335"/>
    </svg>
  )
}

/* ── Aurora Background ── */
function AuroraBg({ variant = 'default' }) {
  const base = variant === 'visual' ? 'auth-aurora' : 'auth-form-aurora'
  return (
    <div className={`${base}-bg`} aria-hidden="true">
      <div className={`${base}-cloud ${base}-cloud--crimson`} />
      <div className={`${base}-cloud ${base}-cloud--magenta`} />
      <div className={`${base}-cloud ${base}-cloud--rose`} />
    </div>
  )
}

/* ── Neural Constellation Canvas ── */
function NeuralCanvas({ className = 'auth-neural-canvas', colorMode = 'crimson' }) {
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

    const palettes = {
      crimson: {
        dark: { node: [34, 211, 238], edge: [34, 211, 238] },
        light: { line: [220, 38, 38], spark: [220, 38, 38] },
      },
      cyan: {
        dark: { node: [34, 211, 238], edge: [99, 102, 241] },
        light: { line: [99, 102, 241], spark: [59, 130, 246] },
      },
    }

    const buildNetwork = (w, h, dark) => {
      const pal = palettes[colorMode] || palettes.crimson
      const nodes = []
      const nodeCount = dark ? 35 : 20

      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          radius: dark ? 1.6 + Math.random() * 1.2 : 1.0 + Math.random() * 0.8,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.3 + Math.random() * 0.3,
        })
      }

      const packets = []
      if (dark) {
        for (let i = 0; i < 5; i++) {
          const startIdx = Math.floor(Math.random() * nodeCount)
          let targetIdx = (startIdx + 1 + Math.floor(Math.random() * (nodeCount - 1))) % nodeCount
          packets.push({
            startNodeIdx: startIdx,
            targetNodeIdx: targetIdx,
            progress: Math.random(),
            speed: 0.003 + Math.random() * 0.003,
            size: 1.8 + Math.random() * 1.0,
          })
        }
      }

      const lines = []
      const sparks = []
      if (!dark) {
        const linesCount = 8
        for (let i = 0; i < linesCount; i++) {
          lines.push({
            yOffset: (h / linesCount) * i - (h * 0.1),
            amplitude: 25 + Math.random() * 50,
            frequency: 0.002 + Math.random() * 0.002,
            phase: Math.random() * Math.PI * 2,
            speed: 0.0005 + Math.random() * 0.001,
            colorAlpha: 0.05 + Math.random() * 0.12,
            thickness: 0.5 + Math.random() * 0.8,
          })
        }
        for (let i = 0; i < 4; i++) {
          sparks.push({
            lineIndex: Math.floor(Math.random() * linesCount),
            progress: Math.random() * w,
            speed: 0.5 + Math.random() * 1.0,
            size: 1.0 + Math.random() * 1.0,
          })
        }
      }

      return { isDarkNetwork: dark, nodes, packets, lines, sparks, pal }
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

      const c = net.pal.dark.node

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
              const alpha = (1 - dist / 140) * 0.15
              ctx.strokeStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`
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
          ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${0.35 + pulse * 0.25})`
          ctx.fill()
          ctx.beginPath()
          ctx.arc(n.x, n.y, r * 2.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${0.04 * pulse})`
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
          ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.85)`
          ctx.fill()
          ctx.beginPath()
          ctx.arc(px, py, p.size * 3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.12)`
          ctx.fill()
        }
      } else {
        const lc = net.pal.light.line
        for (const line of net.lines) {
          ctx.beginPath()
          ctx.strokeStyle = `rgba(${lc[0]}, ${lc[1]}, ${lc[2]}, ${line.colorAlpha})`
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
        }

        const sc = net.pal.light.spark
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
          ctx.fillStyle = `rgba(${sc[0]}, ${sc[1]}, ${sc[2]}, 0.65)`
          ctx.fill()
          ctx.beginPath()
          ctx.arc(x, y, spark.size * 3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${sc[0]}, ${sc[1]}, ${sc[2]}, 0.10)`
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
  }, [colorMode])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

/* ── Main AuthScreen ── */
export default function AuthScreen({ mode = 'login', onModeChange, onAuthenticated }) {
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const { t } = useLanguage()

  const platformPoints = useMemo(
    () => [
      {
        icon: <Network size={18} />,
        title: t('auth.feature_connected_title'),
        description: t('auth.feature_connected_desc'),
      },
      {
        icon: <Database size={18} />,
        title: t('auth.feature_governed_title'),
        description: t('auth.feature_governed_desc'),
      },
      {
        icon: <ShieldCheck size={18} />,
        title: t('auth.feature_admin_title'),
        description: t('auth.feature_admin_desc'),
      },
    ],
    [t],
  )

  const [form, setForm] = useState({
    email: '',
    username: '',
    password: '',
    fullName: '',
  })

  useEffect(() => {
    setForm({ email: '', username: '', password: '', fullName: '' })
  }, [mode])

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      const payload = mode === 'register'
        ? await register(form.email, form.username, form.password, form.fullName)
        : await login(form.username, form.password)
      onAuthenticated?.(payload?.user || null)
    } catch {
      // auth store already exposes the error
    }
  }

  const visualColorMode = mode === 'login' ? 'crimson' : 'cyan'

  return (
    <div className={`auth-page auth-page-split min-h-screen bg-void text-starlight auth-mode-${mode}`}>
      <div className="auth-split-shell">
        {/* ── Visual Pane — mode-aware colors ── */}
        <section className={`auth-visual-pane auth-visual-pane--${mode} auth-animate-slide-left`}>
          <AuroraBg variant="visual" />
          <NeuralCanvas className="auth-neural-canvas" colorMode={visualColorMode} />
          <div className="auth-visual-overlay" />

          <div className="auth-visual-copy">
            <div className="auth-animate-fade-up" style={{ animationDelay: '0ms' }}>
              <div className="auth-badge">
                <Sparkles size={14} />
                {t('auth.platform_badge')}
              </div>
            </div>

            <div className="auth-hero-mark auth-animate-fade-up" style={{ animationDelay: '80ms' }}>
              <MotionLink
                to="/"
                className="auth-logo cursor-pointer"
                whileHover={{ scale: 1.08, rotate: 3 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              >
                <Network size={28} color="#ffffff" strokeWidth={2.2} />
              </MotionLink>
              <div>
                <div className="auth-brand-name">{t('brand.title')}</div>
                <div className="auth-brand-subtitle">{t('auth.brand_subtitle')}</div>
              </div>
            </div>

            <h1 className="auth-hero-title auth-animate-fade-up" style={{ animationDelay: '160ms' }}>
              {t('auth.hero_title')}
            </h1>

            <p className="auth-hero-text auth-animate-fade-up" style={{ animationDelay: '240ms' }}>
              {t('auth.hero_text')}
            </p>

            <div className="auth-visual-grid">
              {platformPoints.map((item, idx) => (
                <motion.div
                  key={item.title}
                  className="auth-visual-card auth-animate-fade-up"
                  style={{ animationDelay: `${320 + idx * 80}ms` }}
                  whileHover={{ x: 4, borderColor: 'var(--c-primary)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <div className="auth-visual-icon">{item.icon}</div>
                  <div>
                    <div className="auth-visual-card-title">{item.title}</div>
                    <div className="auth-visual-card-text">{item.description}</div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="auth-visual-metrics auth-animate-fade-up" style={{ animationDelay: '560ms' }}>
              <motion.div
                className="auth-metric-card"
                whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <span className="auth-metric-label">{t('auth.metric_runs_label')}</span>
                <strong>{t('auth.metric_runs_value')}</strong>
              </motion.div>
              <motion.div
                className="auth-metric-card"
                whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <span className="auth-metric-label">{t('auth.metric_dataset_label')}</span>
                <strong>{t('auth.metric_dataset_value')}</strong>
              </motion.div>
              <motion.div
                className="auth-metric-card"
                whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <span className="auth-metric-label">{t('auth.metric_session_label')}</span>
                <strong>{t('auth.metric_session_value')}</strong>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Form Pane — aurora background ── */}
        <section className="auth-form-pane auth-animate-slide-right">
          <AuroraBg variant="form" />
          <NeuralCanvas className="auth-form-neural-canvas" colorMode="crimson" />

          <div className="auth-form-shell">
            <div className="flex items-start justify-between gap-3 auth-animate-fade-up" style={{ animationDelay: '0ms' }}>
              <div className="auth-compact-brand">
                <MotionLink
                  to="/"
                  className="auth-logo auth-logo-compact cursor-pointer"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                >
                  <Network size={22} color="#ffffff" strokeWidth={2.2} />
                </MotionLink>
                <div>
                  <div className="auth-brand-name">{t('brand.title')}</div>
                  <div className="auth-brand-subtitle">{t('auth.brand_subtitle')}</div>
                </div>
              </div>
              <LanguageSwitcher variant="compact" />
            </div>

            <div className="auth-form-header auth-animate-fade-up" style={{ animationDelay: '80ms' }}>
              <div className="auth-form-eyebrow">{t('auth.secure_access')}</div>
              <div className="auth-tabs">
                <button
                  type="button"
                  onClick={() => onModeChange?.('login')}
                  className={`auth-tab ${mode === 'login' ? 'auth-tab-active' : ''}`}
                >
                  <LockKeyhole size={14} />
                  {t('auth.sign_in')}
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange?.('register')}
                  className={`auth-tab ${mode === 'register' ? 'auth-tab-active' : ''}`}
                >
                  <UserPlus size={14} />
                  {t('auth.register_tab')}
                </button>
              </div>
            </div>

            {/* Form body — CSS animation, no framer-motion */}
            <div key={mode} className="auth-form-body auth-form-card auth-form-enter">
              <h2 className="auth-form-title">
                {mode === 'login' ? t('auth.welcome_back_title') : t('auth.create_account_title')}
              </h2>
              <p className="auth-form-text">
                {mode === 'login' ? t('auth.login_subtitle') : t('auth.register_subtitle')}
              </p>

              <div className="auth-animate-fade-up" style={{ animationDelay: '100ms' }}>
                <button type="button" className="auth-google-btn">
                  <span className="auth-google-icon">
                    <GoogleIcon />
                  </span>
                  <span className="auth-google-label">{t('auth.continue_with_google')}</span>
                  <span className="auth-google-note">{t('auth.coming_soon')}</span>
                </button>
              </div>

              <div className="auth-divider my-5 auth-animate-fade-up" style={{ animationDelay: '150ms' }}>
                <span>{t('auth.or_credentials')}</span>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'register' ? (
                  <div className="grid gap-4 sm:grid-cols-2 auth-animate-fade-up" style={{ animationDelay: '200ms' }}>
                    <Field
                      label={t('auth.email')}
                      value={form.email}
                      onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                      placeholder={t('auth.email_placeholder')}
                    />
                    <Field
                      label={t('auth.full_name')}
                      value={form.fullName}
                      onChange={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
                      placeholder={t('auth.fullname_placeholder')}
                    />
                  </div>
                ) : null}

                <div className="auth-animate-fade-up" style={{ animationDelay: '250ms' }}>
                  <Field
                    label={t('auth.username')}
                    value={form.username}
                    onChange={(value) => setForm((prev) => ({ ...prev, username: value }))}
                    placeholder={t('auth.username_placeholder')}
                  />
                </div>

                <div className="auth-animate-fade-up" style={{ animationDelay: '300ms' }}>
                  <Field
                    label={t('auth.password')}
                    value={form.password}
                    onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
                    placeholder={t('auth.password_placeholder')}
                    type="password"
                  />
                </div>

                {mode === 'login' ? (
                  <div className="flex items-center justify-between gap-3 auth-animate-fade-up" style={{ animationDelay: '350ms' }}>
                    <div className="text-xs text-twilight">{t('auth.use_existing')}</div>
                    <button type="button" className="auth-link-subtle">
                      <KeyRound size={14} />
                      {t('auth.forgot_password_link')}
                    </button>
                  </div>
                ) : null}

                <AnimatePresence>
                  {error ? (
                    <motion.div
                      className="auth-error"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.3 }}
                    >
                      <span className="auth-error-dot" />
                      {error}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <motion.button
                  type="submit"
                  disabled={loading}
                  className="auth-submit w-full auth-animate-fade-up"
                  style={{ animationDelay: '400ms' }}
                  whileHover={{ scale: 1.015, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {loading ? (
                    <span className="auth-submit-loading">
                      <span className="auth-spinner" />
                      {t('auth.processing')}
                    </span>
                  ) : (
                    <>
                      {mode === 'login' ? t('auth.sign_in_button') : t('auth.create_account_button')}
                      <ArrowRight size={16} />
                    </>
                  )}
                </motion.button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ── Field Component ── */
function Field({ label, value, onChange, placeholder, type = 'text' }) {
  const [focused, setFocused] = useState(false)

  return (
    <label className="auth-field block">
      <div className="auth-field-label">{label}</div>
      <div className="auth-field-wrapper">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="auth-input"
        />
        <div
          className="auth-field-glow"
          style={{ opacity: focused ? 0.7 : 0, transition: 'opacity 250ms ease' }}
        />
      </div>
    </label>
  )
}
