import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Compass,
  Flag,
  GraduationCap,
  Heart,
  Lightbulb,
  Map,
  Microscope,
  Quote,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Telescope,
  Users,
} from 'lucide-react'

const VALUES = [
  {
    icon: Microscope,
    title: 'Researcher-first',
    text: 'We build for the moment between hypothesis and result. Every screen earns its place by getting you to the next decision faster.',
  },
  {
    icon: ShieldCheck,
    title: 'Govern by default',
    text: 'Audit trails, retention policy, and role-based access are not bolted on. They are the foundation under every run and dataset.',
  },
  {
    icon: Heart,
    title: 'Craft over flash',
    text: 'Premium feels quiet. Typography breathes, motion is deliberate, and color is a tool — not a decoration.',
  },
  {
    icon: Lightbulb,
    title: 'Reproducible by design',
    text: 'Replay any epoch, compare any run. If you cannot rerun the result tomorrow, the platform is not done helping you today.',
  },
]

const TIMELINE = [
  {
    year: '2024 · Q3',
    title: 'A studio for graph experiments',
    text: 'GNN Insight began as an internal tool to compare GraphSAGE, GCN, and GAT variants without juggling notebooks and ad-hoc scripts.',
  },
  {
    year: '2024 · Q4',
    title: 'Live training telemetry',
    text: 'We shipped epoch-streaming over WebSockets and the first replay timeline — making training feel like a film you can scrub through.',
  },
  {
    year: '2025 · Q1',
    title: 'Project &amp; dataset governance',
    text: 'Projects, datasets, and version histories landed under one shell. Researchers stopped emailing CSVs around.',
  },
  {
    year: '2025 · Q2',
    title: 'Admin shell and retention',
    text: 'A dedicated admin surface for role management, session monitoring, retention preview, and audit activity.',
  },
  {
    year: '2025 · Q3',
    title: 'Premium UI · today',
    text: 'A complete UI refresh: a refined design system, light and dark themes, and a public landing for the platform.',
  },
]

const TEAM = [
  {
    name: 'Research Engineering',
    role: 'Core platform',
    initials: 'RE',
    blurb: 'Builds the training kernels, snapshot pipeline, and the WebSocket replay engine.',
  },
  {
    name: 'Product Design',
    role: 'UI & UX',
    initials: 'PD',
    blurb: 'Owns the visual language, motion system, and the researcher workflows end to end.',
  },
  {
    name: 'Governance',
    role: 'Admin shell',
    initials: 'GV',
    blurb: 'Designs retention policy, audit logging, and the admin surface that keeps the platform safe.',
  },
  {
    name: 'Applied Research',
    role: 'Task workflows',
    initials: 'AR',
    blurb: 'Shapes the six task experiences and validates them against real-world graph datasets.',
  },
]

export default function AboutPage() {
  return (
    <div className="relative">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="hero-glow left-[-180px] top-0" />
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-16 lg:pt-28 lg:pb-20 relative">
          <div className="max-w-3xl fade-in-up">
            <span className="public-eyebrow">
              <Sparkles size={13} /> About GNN Insight
            </span>
            <h1 className="hero-title mt-6">
              We build the workspace{' '}
              <span className="gradient-text">graph researchers deserve.</span>
            </h1>
            <p className="hero-subtitle mt-6">
              GNN Insight is an internal research platform for training,
              replaying, comparing, and governing Graph Neural Network
              experiments — assembled with the same care as the models it
              hosts.
            </p>
          </div>
        </div>
      </section>

      {/* MISSION / VISION */}
      <section className="mx-auto max-w-7xl px-6 mt-4">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="feature-card">
            <div className="feature-icon">
              <Target size={20} />
            </div>
            <div className="text-base font-semibold text-white-star">Mission</div>
            <p className="mt-2 text-sm text-twilight leading-relaxed">
              Give graph researchers one place to upload, train, replay, and
              compare experiments — without sacrificing governance,
              reproducibility, or design quality.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <Telescope size={20} />
            </div>
            <div className="text-base font-semibold text-white-star">Vision</div>
            <p className="mt-2 text-sm text-twilight leading-relaxed">
              A research shell that feels as crafted as the product surfaces of
              the best modern software — where the tool disappears and only
              the science remains.
            </p>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <div className="max-w-2xl">
          <span className="public-eyebrow">
            <Flag size={13} /> Principles
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-white-star">
            What we believe.
          </h2>
          <p className="mt-4 text-base text-twilight">
            These four ideas shape every decision — from the typography ramp to
            the audit schema.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {VALUES.map((value) => {
            const Icon = value.icon
            return (
              <div key={value.title} className="feature-card">
                <div className="feature-icon">
                  <Icon size={20} />
                </div>
                <div className="text-base font-semibold text-white-star">
                  {value.title}
                </div>
                <p className="mt-2 text-sm text-twilight leading-relaxed">
                  {value.text}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* QUOTE */}
      <section className="mx-auto max-w-5xl px-6 pt-24">
        <div className="relative rounded-3xl border border-line-default bg-deep shadow-card overflow-hidden">
          <div className="absolute -top-16 -left-12 text-amethyst/20">
            <Quote size={140} />
          </div>
          <div className="relative px-8 py-10 md:px-14 md:py-14">
            <p className="text-2xl md:text-3xl font-semibold leading-snug tracking-tight text-white-star">
              “Every visualization is a hypothesis. The interface should make
              that hypothesis easy to inspect, replay, and trust.”
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amethyst to-aurora-pink" />
              <div>
                <div className="text-sm font-semibold text-white-star">Platform team</div>
                <div className="text-xs text-twilight">Design philosophy</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TIMELINE */}
      <section className="mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <div className="max-w-2xl">
          <span className="public-eyebrow">
            <Map size={13} /> The journey
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-white-star">
            How we got here.
          </h2>
          <p className="mt-4 text-base text-twilight">
            A short tour through the milestones that shaped GNN Insight into
            what you see today.
          </p>
        </div>

        <div className="mt-12 relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-line-subtle md:left-1/2 md:-translate-x-px" />
          <div className="space-y-10">
            {TIMELINE.map((entry, idx) => {
              const side = idx % 2 === 0 ? 'left' : 'right'
              return (
                <div
                  key={entry.title}
                  className={`relative grid md:grid-cols-2 gap-6 md:gap-12 ${
                    side === 'left' ? '' : 'md:[&>div:first-child]:order-2'
                  }`}
                >
                  <div className={`pl-10 md:pl-0 ${side === 'left' ? 'md:text-right md:pr-12' : 'md:pl-12'}`}>
                    <div className="text-xs uppercase tracking-ultra text-amethyst font-semibold">
                      {entry.year}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white-star">
                      {entry.title}
                    </div>
                    <p
                      className="mt-2 text-sm text-twilight leading-relaxed"
                      // dangerouslySetInnerHTML used only for &amp; entity
                      dangerouslySetInnerHTML={{ __html: entry.text }}
                    />
                  </div>
                  <div className="hidden md:block" />
                  <span
                    className="absolute left-2.5 md:left-1/2 md:-translate-x-1/2 top-1.5 h-4 w-4 rounded-full bg-gradient-to-br from-amethyst to-aurora-pink shadow-[0_0_0_4px_var(--c-bg)]"
                    style={{ boxShadow: '0 0 0 4px var(--c-bg)' }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section className="mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <div className="max-w-2xl">
          <span className="public-eyebrow">
            <Users size={13} /> The team
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-white-star">
            Four crews. One workspace.
          </h2>
          <p className="mt-4 text-base text-twilight">
            We are a small group spanning research engineering, design, and
            governance — co-located inside the same shell we ship.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map((member) => (
            <div key={member.name} className="feature-card text-left">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amethyst to-aurora-pink flex items-center justify-center text-white font-bold">
                  {member.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white-star">
                    {member.name}
                  </div>
                  <div className="text-xs text-twilight">{member.role}</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-twilight leading-relaxed">
                {member.blurb}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pt-24 lg:pt-32 pb-20 lg:pb-28">
        <div className="relative overflow-hidden rounded-3xl border border-line-default bg-deep shadow-card">
          <div className="absolute inset-0 bg-gradient-to-br from-amethyst/15 via-transparent to-aurora-pink/10 pointer-events-none" />
          <div className="relative px-8 py-12 md:px-14 md:py-16 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 text-xs text-amethyst font-semibold uppercase tracking-ultra">
                <Rocket size={13} /> Ready when you are
              </div>
              <h2 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-white-star">
                Spin up your first experiment in a clean shell.
              </h2>
              <p className="mt-3 text-sm md:text-base text-moonlight">
                Sign in to your team's workspace, or open a fresh account and
                bring your first graph dataset along.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/register" className="btn-galaxy btn-galaxy-lg">
                Create account <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="btn-ghost btn-galaxy-lg">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
