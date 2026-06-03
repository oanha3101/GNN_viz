import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Boxes,
  Compass,
  GitBranch,
  Layers,
  LineChart,
  Network,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import { getDefaultPathForUser } from '../../utils/appRoutes'
import { useLanguage } from '../../contexts/LanguageContext'

export default function LandingPage() {
  const user = useAuthStore((s) => s.user)
  const { t } = useLanguage()
  const primaryCta = user
    ? { to: getDefaultPathForUser(user), label: t('landing.open_workspace') }
    : { to: '/register', label: t('landing.get_started_free') }

  const features = [
    { icon: Workflow, title: t('landing.feature_six_title'), description: t('landing.feature_six_desc') },
    { icon: Layers, title: t('landing.feature_models_title'), description: t('landing.feature_models_desc') },
    { icon: Activity, title: t('landing.feature_live_title'), description: t('landing.feature_live_desc') },
    { icon: PlayCircle, title: t('landing.feature_replay_title'), description: t('landing.feature_replay_desc') },
    { icon: BarChart3, title: t('landing.feature_compare_title'), description: t('landing.feature_compare_desc') },
    { icon: ShieldCheck, title: t('landing.feature_gov_title'), description: t('landing.feature_gov_desc') },
  ]

  const stats = [
    { value: '6', label: t('landing.stat_tasks') },
    { value: '3', label: t('landing.stat_encoders') },
    { value: '∞', label: t('landing.stat_replay') },
    { value: '100%', label: t('landing.stat_audit') },
  ]

  const workflowSteps = [
    { icon: Boxes, title: t('landing.step_upload'), text: t('landing.step_upload_text') },
    { icon: Compass, title: t('landing.step_configure'), text: t('landing.step_configure_text') },
    { icon: Zap, title: t('landing.step_train'), text: t('landing.step_train_text') },
    { icon: LineChart, title: t('landing.step_review'), text: t('landing.step_review_text') },
  ]

  const previewSidebar = [
    { label: t('landing.preview_dataset'), value: 'Cora · v3' },
    { label: t('landing.preview_task'), value: t('landing.preview_node_class') },
    { label: t('landing.preview_model'), value: 'GraphSAGE' },
    { label: t('landing.preview_optimizer'), value: 'Adam' },
    { label: t('landing.preview_schedule'), value: 'Cosine' },
  ]

  const previewMetrics = [
    { label: t('landing.preview_train_loss'), value: '0.184', trend: '↓ 12%' },
    { label: t('landing.preview_val_acc'), value: '92.4%', trend: '↑ 3.1%' },
    { label: t('landing.preview_macro_f1'), value: '0.913', trend: '↑ 2.7%' },
    { label: t('landing.preview_latency'), value: '11.4 ms', trend: '↓ 8%' },
  ]

  return (
    <div className="relative">
      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="hero-glow left-[-180px] top-[-120px]" />
        <div className="hero-glow right-[-180px] top-[120px]" />
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 lg:pt-28 lg:pb-28 relative">
          <div className="max-w-3xl fade-in-up">
            <span className="public-eyebrow">
              <Sparkles size={13} />
              {t('landing.eyebrow')}
            </span>
            <h1 className="hero-title mt-6">
              {t('landing.hero_title_a')}{' '}
              <span className="gradient-text">{t('landing.hero_title_b')}</span>{' '}
              {t('landing.hero_title_c')}
            </h1>
            <p className="hero-subtitle mt-6">
              {t('landing.hero_subtitle')}
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link to={primaryCta.to} className="btn-galaxy btn-galaxy-lg">
                {primaryCta.label}
                <ArrowRight size={16} />
              </Link>
              <Link to="/about" className="btn-ghost btn-galaxy-lg">
                {t('landing.see_how')}
              </Link>
            </div>
            <div className="mt-8 text-xs text-twilight flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-amethyst" />
                {t('landing.role_based')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <GitBranch size={13} className="text-amethyst" />
                {t('landing.versioned_datasets')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Activity size={13} className="text-amethyst" />
                {t('landing.live_streaming')}
              </span>
            </div>
          </div>

          {/* Hero preview card */}
          <div className="mt-16 lg:mt-20 fade-in-up">
            <div className="relative mx-auto max-w-5xl">
              <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-amethyst/20 via-aurora-pink/10 to-transparent blur-2xl pointer-events-none" />
              <div className="relative rounded-3xl border border-line-default bg-deep shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-line-subtle bg-nebula">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-aurora-rose/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-aurora-amber/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-aurora-green/70" />
                  </div>
                  <div className="text-[11px] font-mono text-twilight tracking-wider">
                    gnn-insight / lab / training
                  </div>
                  <div className="text-[11px] font-mono text-twilight">epoch 42 / 200</div>
                </div>
                <div className="grid lg:grid-cols-[260px_1fr] min-h-[360px]">
                  <div className="border-r border-line-subtle p-4 space-y-3 bg-deep">
                    {previewSidebar.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between rounded-lg border border-line-subtle bg-nebula px-3 py-2"
                      >
                        <span className="text-xs text-moonlight">{item.label}</span>
                        <span className="text-[10px] font-mono text-twilight">{item.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="p-6 grid gap-4 grid-cols-2">
                    {previewMetrics.map((m) => (
                      <div
                        key={m.label}
                        className="rounded-2xl border border-line-subtle bg-deep p-4"
                      >
                        <div className="text-[11px] uppercase tracking-ultra text-text-shadow">
                          {m.label}
                        </div>
                        <div className="mt-2 text-2xl font-bold text-white-star">{m.value}</div>
                        <div className="mt-1 text-[11px] text-aurora-green font-mono">
                          {m.trend}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LOGO STRIP / STATS ─────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 -mt-10">
        <div className="rounded-3xl border border-line-subtle bg-deep/80 backdrop-blur-md shadow-card p-6 md:p-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl md:text-4xl font-extrabold tracking-tight text-white-star">
                {s.value}
              </div>
              <div className="mt-1 text-xs uppercase tracking-ultra text-twilight">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES GRID ──────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <div className="max-w-2xl">
          <span className="public-eyebrow">
            <Network size={13} /> {t('landing.capabilities')}
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-white-star">
            {t('landing.capabilities_title')}
          </h2>
          <p className="mt-4 text-base text-twilight">
            {t('landing.capabilities_sub')}
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="feature-card">
                <div className="feature-icon">
                  <Icon size={20} />
                </div>
                <div className="text-base font-semibold text-white-star">
                  {feature.title}
                </div>
                <p className="mt-2 text-sm text-twilight leading-relaxed">
                  {feature.description}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── WORKFLOW ───────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <div className="max-w-2xl">
          <span className="public-eyebrow">
            <Workflow size={13} /> {t('landing.the_flow')}
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-white-star">
            {t('landing.flow_title')}
          </h2>
          <p className="mt-4 text-base text-twilight">
            {t('landing.flow_sub')}
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map((step, i) => {
            const Icon = step.icon
            return (
              <div
                key={step.title}
                className="feature-card relative"
              >
                <div className="absolute top-5 right-5 text-[10px] font-mono text-text-shadow tracking-wider">
                  0{i + 1}
                </div>
                <div className="feature-icon">
                  <Icon size={20} />
                </div>
                <div className="text-base font-semibold text-white-star">
                  {step.title}
                </div>
                <p className="mt-2 text-sm text-twilight leading-relaxed">
                  {step.text}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pt-24 lg:pt-32 pb-20 lg:pb-28">
        <div className="relative overflow-hidden rounded-3xl border border-line-default bg-deep shadow-card">
          <div className="absolute inset-0 bg-gradient-to-br from-amethyst/15 via-transparent to-aurora-pink/10 pointer-events-none" />
          <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-gradient-to-br from-amethyst/40 to-aurora-pink/20 blur-3xl pointer-events-none" />
          <div className="relative px-8 py-12 md:px-14 md:py-16 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-white-star">
                {t('landing.cta_title')}
              </h2>
              <p className="mt-3 text-sm md:text-base text-moonlight">
                {t('landing.cta_sub')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to={primaryCta.to} className="btn-galaxy btn-galaxy-lg">
                {primaryCta.label}
                <ArrowRight size={16} />
              </Link>
              {!user ? (
                <Link to="/login" className="btn-ghost btn-galaxy-lg">
                  {t('landing.sign_in')}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
