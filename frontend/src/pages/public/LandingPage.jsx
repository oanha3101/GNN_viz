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

const FEATURES = [
  {
    icon: Workflow,
    title: 'Six task workflows',
    description:
      'Node, graph, link, community, embedding, generation — each task gets purpose-built panels for setup, training, and review.',
  },
  {
    icon: Layers,
    title: 'GraphSAGE · GCN · GAT',
    description:
      'Swap encoders without rewriting the pipeline. Hyper-parameters and training context travel with every run.',
  },
  {
    icon: Activity,
    title: 'Live epoch streaming',
    description:
      'WebSocket-powered telemetry. Watch metrics, embeddings, and topology evolve epoch by epoch — no refresh needed.',
  },
  {
    icon: PlayCircle,
    title: 'Replay any run',
    description:
      'Every session is snapshot-ready. Scrub back through training and compare versions with frame-accurate replay.',
  },
  {
    icon: BarChart3,
    title: 'Compare runs side-by-side',
    description:
      'Stack experiments next to each other, diff metrics, and surface the variant worth promoting.',
  },
  {
    icon: ShieldCheck,
    title: 'Governed by default',
    description:
      'Role-based access, audit trails, and retention policy live in the admin shell — not as an afterthought.',
  },
]

const STATS = [
  { value: '6', label: 'GNN tasks supported' },
  { value: '3', label: 'Encoder families' },
  { value: '∞', label: 'Replayable epochs' },
  { value: '100%', label: 'Audit coverage' },
]

const WORKFLOW_STEPS = [
  {
    icon: Boxes,
    title: 'Upload',
    text: 'Drop in a graph dataset and pick the task. Versioning, schema preview, and trainable context happen automatically.',
  },
  {
    icon: Compass,
    title: 'Configure',
    text: 'Choose the encoder, hyper-parameters, and split policy. Defaults are sensible; overrides are explicit.',
  },
  {
    icon: Zap,
    title: 'Train',
    text: 'Hit run and watch the live stream. Metrics, embeddings, and topology animate as the model converges.',
  },
  {
    icon: LineChart,
    title: 'Review',
    text: 'Replay any epoch, compare runs, and export research-grade reports for your team.',
  },
]

export default function LandingPage() {
  const user = useAuthStore((s) => s.user)
  const primaryCta = user
    ? { to: getDefaultPathForUser(user), label: 'Open workspace' }
    : { to: '/register', label: 'Get started — it is free' }

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
              Graph Neural Network Research Platform
            </span>
            <h1 className="hero-title mt-6">
              The cleanest way to{' '}
              <span className="gradient-text">train, replay, and govern</span>{' '}
              your graph experiments.
            </h1>
            <p className="hero-subtitle mt-6">
              GNN Insight gives researchers a single, premium workspace for the
              entire graph-learning loop — from dataset upload to model
              comparison, with live training telemetry and audit-ready
              governance built in.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link to={primaryCta.to} className="btn-galaxy btn-galaxy-lg">
                {primaryCta.label}
                <ArrowRight size={16} />
              </Link>
              <Link to="/about" className="btn-ghost btn-galaxy-lg">
                See how it works
              </Link>
            </div>
            <div className="mt-8 text-xs text-twilight flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-amethyst" />
                Role-based access
              </span>
              <span className="inline-flex items-center gap-1.5">
                <GitBranch size={13} className="text-amethyst" />
                Versioned datasets
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Activity size={13} className="text-amethyst" />
                Live epoch streaming
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
                    {['Dataset', 'Task', 'Model', 'Optimizer', 'Schedule'].map((item, i) => (
                      <div
                        key={item}
                        className="flex items-center justify-between rounded-lg border border-line-subtle bg-nebula px-3 py-2"
                      >
                        <span className="text-xs text-moonlight">{item}</span>
                        <span className="text-[10px] font-mono text-twilight">
                          {['Cora · v3', 'Node class.', 'GraphSAGE', 'Adam', 'Cosine'][i]}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="p-6 grid gap-4 grid-cols-2">
                    {[
                      { label: 'Train loss', value: '0.184', trend: '↓ 12%' },
                      { label: 'Val accuracy', value: '92.4%', trend: '↑ 3.1%' },
                      { label: 'Macro F1', value: '0.913', trend: '↑ 2.7%' },
                      { label: 'Avg latency', value: '11.4 ms', trend: '↓ 8%' },
                    ].map((m) => (
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
          {STATS.map((s) => (
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
            <Network size={13} /> Capabilities
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-white-star">
            A research workspace built for graph people.
          </h2>
          <p className="mt-4 text-base text-twilight">
            Every feature is opinionated, fast, and gets out of your way. Train
            the model, not the tooling.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
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
            <Workflow size={13} /> The flow
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-white-star">
            Upload, train, replay, ship.
          </h2>
          <p className="mt-4 text-base text-twilight">
            Four steps. No context-switching. Every result is reproducible by
            design.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW_STEPS.map((step, i) => {
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
                Bring graph research into a clean, modern shell.
              </h2>
              <p className="mt-3 text-sm md:text-base text-moonlight">
                Sign in to your team's workspace, or open a fresh account and
                start your first experiment in minutes.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to={primaryCta.to} className="btn-galaxy btn-galaxy-lg">
                {primaryCta.label}
                <ArrowRight size={16} />
              </Link>
              {!user ? (
                <Link to="/login" className="btn-ghost btn-galaxy-lg">
                  Sign in
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
