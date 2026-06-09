import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Flag,
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
import { useLanguage } from '../../contexts/LanguageContext'

export default function AboutPage() {
  const { t } = useLanguage()

  const values = [
    { icon: Microscope, title: t('about.v_researcher_title'), text: t('about.v_researcher_text') },
    { icon: ShieldCheck, title: t('about.v_govern_title'), text: t('about.v_govern_text') },
    { icon: Heart, title: t('about.v_craft_title'), text: t('about.v_craft_text') },
    { icon: Lightbulb, title: t('about.v_repro_title'), text: t('about.v_repro_text') },
  ]

  const timeline = [
    { year: t('about.tl1_year'), title: t('about.tl1_title'), text: t('about.tl1_text') },
    { year: t('about.tl2_year'), title: t('about.tl2_title'), text: t('about.tl2_text') },
    { year: t('about.tl3_year'), title: t('about.tl3_title'), text: t('about.tl3_text') },
    { year: t('about.tl4_year'), title: t('about.tl4_title'), text: t('about.tl4_text') },
    { year: t('about.tl5_year'), title: t('about.tl5_title'), text: t('about.tl5_text') },
  ]

  const team = [
    { name: t('about.tm1_name'), role: t('about.tm1_role'), initials: 'RE', blurb: t('about.tm1_blurb') },
    { name: t('about.tm2_name'), role: t('about.tm2_role'), initials: 'PD', blurb: t('about.tm2_blurb') },
    { name: t('about.tm3_name'), role: t('about.tm3_role'), initials: 'GV', blurb: t('about.tm3_blurb') },
    { name: t('about.tm4_name'), role: t('about.tm4_role'), initials: 'AR', blurb: t('about.tm4_blurb') },
  ]

  return (
    <div className="relative">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="hero-glow left-[-180px] top-0" />
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-16 lg:pt-28 lg:pb-20 relative">
          <div className="max-w-3xl fade-in-up">
            <span className="public-eyebrow">
              <Sparkles size={13} /> {t('about.eyebrow')}
            </span>
            <h1 className="hero-title mt-6">
              {t('about.hero_title_a')}{' '}
              <span className="gradient-text">{t('about.hero_title_b')}</span>
            </h1>
            <p className="hero-subtitle mt-6">
              {t('about.hero_subtitle')}
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
            <div className="text-base font-semibold text-white-star">{t('about.mission')}</div>
            <p className="mt-2 text-sm text-twilight leading-relaxed">
              {t('about.mission_text')}
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <Telescope size={20} />
            </div>
            <div className="text-base font-semibold text-white-star">{t('about.vision')}</div>
            <p className="mt-2 text-sm text-twilight leading-relaxed">
              {t('about.vision_text')}
            </p>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <div className="max-w-2xl">
          <span className="public-eyebrow">
            <Flag size={13} /> {t('about.principles')}
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-white-star">
            {t('about.principles_title')}
          </h2>
          <p className="mt-4 text-base text-twilight">
            {t('about.principles_sub')}
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {values.map((value) => {
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
              {t('about.quote_text')}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amethyst to-aurora-pink" />
              <div>
                <div className="text-sm font-semibold text-white-star">{t('about.quote_author')}</div>
                <div className="text-xs text-twilight">{t('about.quote_role')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TIMELINE */}
      <section className="mx-auto max-w-7xl px-6 pt-24 lg:pt-32">
        <div className="max-w-2xl">
          <span className="public-eyebrow">
            <Map size={13} /> {t('about.the_journey')}
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-white-star">
            {t('about.journey_title')}
          </h2>
          <p className="mt-4 text-base text-twilight">
            {t('about.journey_sub')}
          </p>
        </div>

        <div className="mt-12 relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-line-subtle md:left-1/2 md:-translate-x-px" />
          <div className="space-y-10">
            {timeline.map((entry, idx) => {
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
                    <p className="mt-2 text-sm text-twilight leading-relaxed">
                      {entry.text}
                    </p>
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
            <Users size={13} /> {t('about.the_team')}
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-white-star">
            {t('about.team_title')}
          </h2>
          <p className="mt-4 text-base text-twilight">
            {t('about.team_sub')}
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((member) => (
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
                <Rocket size={13} /> {t('about.ready')}
              </div>
              <h2 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-white-star">
                {t('about.cta_title')}
              </h2>
              <p className="mt-3 text-sm md:text-base text-moonlight">
                {t('about.cta_sub')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/register" className="btn-galaxy btn-galaxy-lg">
                {t('about.create_account')} <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="btn-ghost btn-galaxy-lg">
                {t('about.sign_in')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
