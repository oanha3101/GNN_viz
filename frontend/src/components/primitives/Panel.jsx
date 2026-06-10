export function Panel({
  title,
  subtitle,
  actions,
  footer,
  padding = 'md',
  className = '',
  children,
  ...rest
}) {
  const padMap = { none: '', sm: 'p-2', md: 'p-4' }
  return (
    <section
      className={`flex flex-col h-full rounded-2xl border border-line-default/60 bg-gradient-to-b from-nebula/80 to-nebula/50 shadow-[0_2px_16px_rgba(0,0,0,0.10),0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl overflow-hidden transition-all ${className}`}
      {...rest}
    >
      <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line-default/40 shrink-0 bg-gradient-to-r from-amethyst/[0.06] via-transparent to-transparent">
        <div className="min-w-0">
          <h3 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amethyst/90 truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 text-[11px] leading-relaxed text-starlight/55 line-clamp-2">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
      <div className={`flex-1 min-h-0 overflow-auto ${padMap[padding]}`}>{children}</div>
      {footer && (
        <footer className="px-5 py-2.5 border-t border-line-default/40 shrink-0 bg-gradient-to-r from-black/20 to-black/10">{footer}</footer>
      )}
    </section>
  )
}

export default Panel
