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
      className={`flex flex-col h-full bg-black/20 rounded-2xl border border-amethyst/20 shadow-[0_4px_24px_rgba(147,51,234,0.08)] backdrop-blur-md overflow-hidden transition-all ${className}`}
      {...rest}
    >
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-amethyst/20 shrink-0 bg-gradient-to-r from-amethyst/10 to-transparent">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-amethyst truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 text-[11px] text-starlight/70 truncate">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
      </header>
      <div className={`flex-1 min-h-0 overflow-auto ${padMap[padding]}`}>{children}</div>
      {footer && (
        <footer className="px-5 py-3 border-t border-amethyst/20 shrink-0 bg-black/40">{footer}</footer>
      )}
    </section>
  )
}

export default Panel
