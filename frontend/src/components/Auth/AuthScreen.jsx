import { useEffect, useState } from 'react'
import { ArrowRight, LockKeyhole, Network, Sparkles, UserPlus, Zap, Eye, GitBranch } from 'lucide-react'
import useAuthStore from '../../store/authStore'

export default function AuthScreen({ mode = 'login', onModeChange, onAuthenticated }) {
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)

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

  return (
    <div className="auth-page min-h-screen bg-void text-starlight overflow-hidden">
      {/* ── Animated Cosmic Background ── */}
      <div className="auth-cosmos">
        {/* Nebula clouds — brighter, more visible */}
        <div className="auth-nebula auth-nebula-1" />
        <div className="auth-nebula auth-nebula-2" />
        <div className="auth-nebula auth-nebula-3" />
        <div className="auth-nebula auth-nebula-4" />

        {/* Floating particles */}
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="auth-particle"
            style={{
              '--x': `${Math.random() * 100}%`,
              '--y': `${Math.random() * 100}%`,
              '--size': `${Math.random() * 3 + 1}px`,
              '--duration': `${Math.random() * 20 + 15}s`,
              '--delay': `${Math.random() * -20}s`,
              '--drift': `${(Math.random() - 0.5) * 120}px`,
            }}
          />
        ))}

        {/* Constellation graph — connected nodes with edges */}
        <svg className="auth-constellation" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(147,51,234,0)" />
              <stop offset="50%" stopColor="rgba(147,51,234,0.35)" />
              <stop offset="100%" stopColor="rgba(129,140,248,0)" />
            </linearGradient>
            <linearGradient id="line-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(129,140,248,0)" />
              <stop offset="50%" stopColor="rgba(129,140,248,0.25)" />
              <stop offset="100%" stopColor="rgba(244,114,182,0)" />
            </linearGradient>
            <linearGradient id="line-grad-3" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(244,114,182,0)" />
              <stop offset="50%" stopColor="rgba(196,181,253,0.2)" />
              <stop offset="100%" stopColor="rgba(147,51,234,0)" />
            </linearGradient>
            {/* Node glow filter */}
            <filter id="node-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Graph cluster 1 — top left */}
          <line x1="80" y1="120" x2="250" y2="200" stroke="url(#line-grad)" strokeWidth="1" className="auth-line" />
          <line x1="250" y1="200" x2="180" y2="350" stroke="url(#line-grad)" strokeWidth="1" className="auth-line" style={{ animationDelay: '-2s' }} />
          <line x1="80" y1="120" x2="180" y2="350" stroke="url(#line-grad)" strokeWidth="0.7" className="auth-line" style={{ animationDelay: '-4s' }} />
          <line x1="250" y1="200" x2="420" y2="150" stroke="url(#line-grad)" strokeWidth="1" className="auth-line" style={{ animationDelay: '-1s' }} />
          <line x1="420" y1="150" x2="380" y2="320" stroke="url(#line-grad-2)" strokeWidth="1" className="auth-line" style={{ animationDelay: '-5s' }} />
          <line x1="180" y1="350" x2="380" y2="320" stroke="url(#line-grad)" strokeWidth="0.7" className="auth-line" style={{ animationDelay: '-3s' }} />

          {/* Graph cluster 2 — top right */}
          <line x1="1050" y1="100" x2="1200" y2="220" stroke="url(#line-grad-2)" strokeWidth="1" className="auth-line" style={{ animationDelay: '-6s' }} />
          <line x1="1200" y1="220" x2="1350" y2="150" stroke="url(#line-grad-2)" strokeWidth="1" className="auth-line" style={{ animationDelay: '-8s' }} />
          <line x1="1050" y1="100" x2="1350" y2="150" stroke="url(#line-grad-2)" strokeWidth="0.7" className="auth-line" style={{ animationDelay: '-7s' }} />
          <line x1="1200" y1="220" x2="1280" y2="380" stroke="url(#line-grad-3)" strokeWidth="1" className="auth-line" style={{ animationDelay: '-9s' }} />
          <line x1="1350" y1="150" x2="1380" y2="350" stroke="url(#line-grad-2)" strokeWidth="0.7" className="auth-line" style={{ animationDelay: '-10s' }} />

          {/* Graph cluster 3 — bottom */}
          <line x1="150" y1="550" x2="350" y2="650" stroke="url(#line-grad-3)" strokeWidth="1" className="auth-line" style={{ animationDelay: '-4s' }} />
          <line x1="350" y1="650" x2="550" y2="580" stroke="url(#line-grad-3)" strokeWidth="1" className="auth-line" style={{ animationDelay: '-6s' }} />
          <line x1="550" y1="580" x2="750" y2="700" stroke="url(#line-grad)" strokeWidth="1" className="auth-line" style={{ animationDelay: '-8s' }} />
          <line x1="150" y1="550" x2="550" y2="580" stroke="url(#line-grad-3)" strokeWidth="0.5" className="auth-line" style={{ animationDelay: '-5s' }} />

          {/* Cross-cluster bridge edges */}
          <line x1="420" y1="150" x2="700" y2="280" stroke="url(#line-grad)" strokeWidth="0.5" className="auth-line" style={{ animationDelay: '-11s' }} />
          <line x1="700" y1="280" x2="1050" y2="100" stroke="url(#line-grad-2)" strokeWidth="0.5" className="auth-line" style={{ animationDelay: '-12s' }} />
          <line x1="380" y1="320" x2="550" y2="580" stroke="url(#line-grad-3)" strokeWidth="0.5" className="auth-line" style={{ animationDelay: '-7s' }} />
          <line x1="1280" y1="380" x2="1380" y2="550" stroke="url(#line-grad-2)" strokeWidth="0.5" className="auth-line" style={{ animationDelay: '-13s' }} />
        </svg>

        {/* Constellation nodes — bright stars at graph vertices */}
        {[
          // Cluster 1
          { x: 80, y: 120, s: 5 }, { x: 250, y: 200, s: 6 }, { x: 180, y: 350, s: 4 },
          { x: 420, y: 150, s: 5 }, { x: 380, y: 320, s: 4 }, { x: 700, y: 280, s: 3 },
          // Cluster 2
          { x: 1050, y: 100, s: 5 }, { x: 1200, y: 220, s: 6 }, { x: 1350, y: 150, s: 4 },
          { x: 1280, y: 380, s: 4 }, { x: 1380, y: 550, s: 3 },
          // Cluster 3
          { x: 150, y: 550, s: 4 }, { x: 350, y: 650, s: 5 }, { x: 550, y: 580, s: 4 },
          { x: 750, y: 700, s: 3 }, { x: 900, y: 750, s: 3 },
          // Scattered
          { x: 600, y: 100, s: 2 }, { x: 900, y: 450, s: 2 }, { x: 1100, y: 600, s: 3 },
        ].map((node, i) => (
          <div
            key={`node-${i}`}
            className="auth-node"
            style={{
              left: `${(node.x / 1440) * 100}%`,
              top: `${(node.y / 900) * 100}%`,
              width: `${node.s}px`,
              height: `${node.s}px`,
              animationDelay: `${i * -1.2}s`,
            }}
          />
        ))}
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="auth-logo mx-auto mb-4">
              <Network size={28} className="text-white" />
            </div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-moonlight">GNN-Insight</div>
            <div className="mt-1 text-[11px] text-twilight">Graph Neural Network Research Platform</div>
          </div>

          {/* Form Card */}
          <div className="auth-card-container">
            {/* Sparkle dust around card */}
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={`sparkle-${i}`}
                className="auth-sparkle"
                style={{
                  '--sx': `${Math.random() * 100}%`,
                  '--sy': `${Math.random() * 100}%`,
                  '--sd': `${Math.random() * 3 + 1}px`,
                  '--sdur': `${Math.random() * 4 + 3}s`,
                  '--sdel': `${Math.random() * -5}s`,
                }}
              />
            ))}

            <div className="auth-card">
              {/* Aurora shimmer sweep */}
              <div className="auth-card-glow" />
              <div className="auth-card-shimmer" />

            <div className="relative z-10 p-7">
              {/* Mode tabs */}
              <div className="auth-tabs mb-6">
                <button
                  type="button"
                  onClick={() => onModeChange?.('login')}
                  className={`auth-tab ${mode === 'login' ? 'auth-tab-active' : ''}`}
                >
                  <LockKeyhole size={14} />
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange?.('register')}
                  className={`auth-tab ${mode === 'register' ? 'auth-tab-active' : ''}`}
                >
                  <UserPlus size={14} />
                  Register
                </button>
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-white-star">
                {mode === 'login' ? 'Welcome back, researcher' : 'Create your account'}
              </h2>
              <p className="mt-1.5 text-xs text-twilight">
                {mode === 'login'
                  ? 'Enter your credentials to access the workspace'
                  : 'Initialize a new research account to start training'}
              </p>

              {/* Form */}
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                {mode === 'register' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Email"
                      value={form.email}
                      onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                      placeholder="you@example.com"
                    />
                    <Field
                      label="Full name"
                      value={form.fullName}
                      onChange={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
                      placeholder="Nguyen Van A"
                    />
                  </div>
                ) : null}

                <Field
                  label="Username"
                  value={form.username}
                  onChange={(value) => setForm((prev) => ({ ...prev, username: value }))}
                  placeholder="your_username"
                />
                <Field
                  label="Password"
                  value={form.password}
                  onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
                  placeholder="••••••••••"
                  type="password"
                />

                {error ? (
                  <div className="auth-error">
                    <span className="auth-error-dot" />
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="auth-submit w-full"
                >
                  {loading ? (
                    <span className="auth-submit-loading">
                      <span className="auth-spinner" />
                      Processing...
                    </span>
                  ) : (
                    <>
                      {mode === 'login' ? 'Sign In' : 'Create Account'}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="auth-divider my-6">
                <span>or continue with</span>
              </div>

              {/* Social / quick actions */}
              <div className="grid grid-cols-3 gap-3">
                <QuickAuth icon={<Zap size={16} />} label="Quick Demo" />
                <QuickAuth icon={<Eye size={16} />} label="Viewer" />
                <QuickAuth icon={<GitBranch size={16} />} label="GitHub" />
              </div>
            </div>
          </div>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-[11px] text-text-shadow">
            GNN-Insight Research Platform • Galaxy Constellation UI
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="auth-field block">
      <div className="auth-field-label">{label}</div>
      <div className="auth-field-wrapper">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="auth-input"
        />
        <div className="auth-field-glow" />
      </div>
    </label>
  )
}

function QuickAuth({ icon, label }) {
  return (
    <button type="button" className="auth-quick-btn">
      {icon}
      <span>{label}</span>
    </button>
  )
}
