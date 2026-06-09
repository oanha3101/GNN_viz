# Landing Page Integration Guide

## Quick Implementation Steps

### Step 1: Import New Components

Add these imports at the top of `frontend/src/pages/public/LandingPage.jsx`:

```javascript
import FloatingMetricPanel from '../../components/landing/FloatingMetricPanel'
import CountUpStat from '../../components/landing/CountUpStat'
```

---

### Step 2: Enhance Hero Section

Find the hero section browser mockup (around line 930) and wrap it with floating panels:

**BEFORE:**
```jsx
<motion.div
  initial={{ opacity: 0, x: 40 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
>
  <div className="relative">
    {/* Glowing backdrop */}
    <div className="absolute -inset-4 rounded-3xl blur-3xl ...">
    </div>
    
    {/* Browser window */}
    <div className="relative rounded-2xl ...">
      {/* ... existing code ... */}
    </div>
  </div>
</motion.div>
```

**AFTER:**
```jsx
<motion.div
  initial={{ opacity: 0, x: 40 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
>
  <div className="relative">
    {/* Floating Metric Panels */}
    <FloatingMetricPanel 
      label="ATTENTION SCORE"
      value="94.8%"
      sublabel="XAI Confidence"
      position="top-right"
      delay={0.6}
    />
    <FloatingMetricPanel 
      label="LIVE EPOCH"
      value={epoch}
      sublabel="Training Progress"
      position="top-left"
      delay={0.8}
    />
    <FloatingMetricPanel 
      label="NODE INFLUENCE"
      value="0.42"
      sublabel="Top Neighbor"
      position="bottom-right"
      delay={1.0}
    />
    
    {/* Glowing backdrop */}
    <div className="absolute -inset-4 rounded-3xl blur-3xl pointer-events-none opacity-60" style={{
      background: 'linear-gradient(135deg, rgba(255,51,102,0.12), transparent, rgba(219,39,119,0.08))',
    }} />
    
    {/* Browser window */}
    <div className="relative rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white/40 dark:bg-slate-900/60 backdrop-blur-md shadow-2xl transition-all duration-500 hover:scale-[1.015] hover:border-slate-300 dark:hover:border-slate-700/80">
      {/* ... existing mockup code ... */}
    </div>
    
    {/* Hero Spotlight */}
    <div className="hero-spotlight" />
  </div>
</motion.div>
```

---

### Step 3: Add Shimmer to Eyebrow

Find the eyebrow badge (around line 890) and add shimmer effect:

**BEFORE:**
```jsx
<motion.span variants={fadeUp} className="landing-eyebrow">
  <Sparkles size={12} className="animate-pulse" />
  {t('landing.eyebrow')}
</motion.span>
```

**AFTER:**
```jsx
<motion.span variants={fadeUp} className="landing-eyebrow">
  <Sparkles size={12} className="animate-pulse shimmer-text" />
  <span className="shimmer-text">{t('landing.eyebrow')}</span>
</motion.span>
```

---

### Step 4: Enhance Primary CTA

Find the primary CTA button and add magnetic hover + glow:

**BEFORE:**
```jsx
<Link to={primaryCta.to} className="landing-btn-primary group">
  {primaryCta.label}
  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
</Link>
```

**AFTER:**
```jsx
<Link to={primaryCta.to} className="landing-btn-primary magnetic-hover glow-effect group">
  {primaryCta.label}
  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
</Link>
```

---

### Step 5: Replace Stats with CountUpStat

Find the stats strip section (around line 1010) and replace with CountUpStat:

**BEFORE:**
```jsx
{stats.map((s, idx) => (
  <motion.div
    key={s.label}
    className="text-center"
    variants={fadeScale}
    custom={idx}
    whileHover={{ scale: 1.08, transition: { type: 'spring', stiffness: 400, damping: 15 } }}
  >
    <div className="landing-stat-number">{s.value}</div>
    <div className="landing-stat-label">{s.label}</div>
    <div className="landing-stat-bar" />
  </motion.div>
))}
```

**AFTER:**
```jsx
{stats.map((s, idx) => (
  <motion.div
    key={s.label}
    variants={fadeScale}
    custom={idx}
  >
    <CountUpStat
      value={s.value}
      label={s.label}
      duration={2000}
      isInfinite={s.value === '∞'}
      isPercentage={typeof s.value === 'string' && s.value.includes('%')}
    />
  </motion.div>
))}
```

---

### Step 6: Enhance Capability Cards

Find the capability cards (around line 1040) and add effects:

**BEFORE:**
```jsx
<motion.div
  key={task.title}
  className="landing-card landing-card-accent"
  variants={fadeScale}
  whileHover={{ y: -6, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
>
  <div className="landing-card-icon">
    <Icon size={18} />
  </div>
  {/* ... rest ... */}
</motion.div>
```

**AFTER:**
```jsx
<motion.div
  key={task.title}
  className="landing-card landing-card-accent glow-effect corner-accent"
  variants={fadeScale}
  whileHover={{ y: -6, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
>
  <div className="landing-card-icon glow-effect">
    <Icon size={18} />
  </div>
  {/* ... rest ... */}
</motion.div>
```

---

### Step 7: Add Timeline Connectors to GNN Flow

Find the GNN steps section (around line 1080) and add connectors:

**BEFORE:**
```jsx
{gnnSteps.map((step, i) => {
  const Icon = step.icon
  return (
    <div key={step.title} className="contents">
      <motion.div className="gnn-flow-step" variants={fadeScale} custom={i}>
        {/* ... step content ... */}
      </motion.div>
      {i < gnnSteps.length - 1 && (
        <div className="gnn-flow-connector hidden lg:block" />
      )}
    </div>
  )
})}
```

**AFTER:**
```jsx
{gnnSteps.map((step, i) => {
  const Icon = step.icon
  return (
    <div key={step.title} className="contents">
      <motion.div 
        className="gnn-flow-step relative" 
        variants={fadeScale} 
        custom={i}
      >
        {/* ... step content ... */}
        
        {/* Timeline connector */}
        {i < gnnSteps.length - 1 && (
          <div className="timeline-connector" />
        )}
      </motion.div>
    </div>
  )
})}
```

---

### Step 8: Enhance Pipeline Cards

Find pipeline steps (around line 1190) and add status chips:

**BEFORE:**
```jsx
<motion.div
  key={step.title}
  className="pipeline-card"
  variants={fadeScale}
  custom={i}
  whileHover={{ y: -6, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
>
  <div className="pipeline-card__dot">
    <Icon size={20} />
  </div>
  <div className="flex-1 w-full">
    <div className="flex items-center justify-between mb-2 w-full">
      <span className="text-[11px] font-mono font-bold tracking-wider" style={{ color: '#FF3366' }}>
        STEP 0{i + 1}
      </span>
    </div>
    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
      {step.title}
    </h3>
    {/* ... */}
  </div>
</motion.div>
```

**AFTER:**
```jsx
<motion.div
  key={step.title}
  className="pipeline-card glow-effect corner-accent"
  variants={fadeScale}
  custom={i}
  whileHover={{ y: -6, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
>
  <div className="pipeline-card__dot glow-effect">
    <Icon size={20} />
  </div>
  <div className="flex-1 w-full">
    <div className="flex items-center justify-between mb-2 w-full">
      <span className="text-[11px] font-mono font-bold tracking-wider" style={{ color: '#FF3366' }}>
        STEP 0{i + 1}
      </span>
      {/* Status Chip */}
      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider"
            style={{
              background: i <= 1 ? 'rgba(34, 197, 94, 0.1)' : 
                         i <= 3 ? 'rgba(251, 146, 60, 0.1)' : 
                         'rgba(148, 163, 184, 0.1)',
              color: i <= 1 ? '#22C55E' : 
                     i <= 3 ? '#FB923C' : 
                     '#94A3B8',
              border: `1px solid ${i <= 1 ? 'rgba(34, 197, 94, 0.2)' : 
                                   i <= 3 ? 'rgba(251, 146, 60, 0.2)' : 
                                   'rgba(148, 163, 184, 0.2)'}`
            }}>
        {i <= 1 ? 'Ready' : i <= 3 ? 'Processing' : 'Queued'}
      </span>
    </div>
    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
      {step.title}
    </h3>
    {/* ... */}
  </div>
</motion.div>
```

---

### Step 9: Optimize ConstellationCanvas

Find the `ConstellationCanvas` component (around line 66) and add these optimizations:

**Add at the beginning of the component:**

```javascript
function ConstellationCanvas() {
  const canvasRef = useRef(null)
  const networkRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    let time = 0
    const isMobile = window.innerWidth < 768

    // Support devicePixelRatio for crisp rendering
    const dpr = window.devicePixelRatio || 1

    const buildNetwork = (w, h) => {
      const nodes = []
      const spacing = isMobile ? 280 : 200 // Fewer nodes on mobile
      const cols = Math.ceil(w / spacing) + 1
      const rows = Math.ceil(h / spacing) + 1
      const jitter = spacing * 0.38

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.12) continue
          nodes.push({
            x: c * spacing + (Math.random() - 0.5) * jitter,
            y: r * spacing + (Math.random() - 0.5) * jitter,
            radius: 1.2 + Math.random() * 1,
            phase: Math.random() * Math.PI * 2,
          })
        }
      }

      // ... rest of buildNetwork code ...

      // Fewer packets on mobile
      const pCount = isMobile 
        ? Math.max(2, Math.min(Math.floor(edges.length * 0.04), 4))
        : Math.max(3, Math.min(Math.floor(edges.length * 0.08), 8))
      
      const packets = Array.from({ length: pCount }, () => ({
        edgeIdx: Math.floor(Math.random() * edges.length),
        progress: Math.random(),
        speed: 0.0012 + Math.random() * 0.001,
        dir: Math.random() > 0.5 ? 1 : -1,
      }))

      return { nodes, edges, packets }
    }

    const resize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      
      // Set canvas size with device pixel ratio
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      
      ctx.scale(dpr, dpr)
      networkRef.current = buildNetwork(width, height)
    }
    
    resize()
    window.addEventListener('resize', resize)

    // Pause when document is hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
        }
      } else {
        draw()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const draw = () => {
      // ... existing draw code ...
      rafRef.current = requestAnimationFrame(draw)
    }
    
    draw()

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none z-0" />
}
```

---

### Step 10: Add Pulse Ring to XAI Target Node

Find the `ExplainabilityGraph` component (around line 320) and enhance the target node:

**Add to the target node rendering:**

```jsx
{nodes.map((node) => {
  const isTarget = node.type === 'target'
  const isInfluential = node.type === 'influential'
  const isHovered = hoveredNode === node.id
  
  return (
    <g
      key={node.id}
      className="cursor-pointer"
      onMouseEnter={() => setHoveredNode(node.id)}
      onMouseLeave={() => setHoveredNode(null)}
    >
      {/* Pulse ring for target node */}
      {isTarget && (
        <circle
          cx={node.x} cy={node.y}
          r={20}
          fill="none"
          stroke={node.color}
          strokeWidth={2}
          opacity={0.5}
          className="pulse-ring"
        />
      )}
      
      {/* Glow */}
      {(isTarget || isInfluential || isHovered) && (
        <circle
          cx={node.x} cy={node.y}
          r={isHovered ? 18 : isTarget ? 16 : 12}
          fill={node.color}
          opacity={isHovered ? 0.2 : 0.1}
          className="transition-all duration-300"
        />
      )}
      
      {/* ... rest of node rendering ... */}
    </g>
  )
})}
```

---

## Summary of Changes

### Files Modified:
1. ✅ `frontend/src/index.css` - Added premium CSS classes
2. ⏳ `frontend/src/pages/public/LandingPage.jsx` - Apply enhancements above

### Files Created:
1. ✅ `frontend/src/components/landing/FloatingMetricPanel.jsx`
2. ✅ `frontend/src/components/landing/CountUpStat.jsx`

### Key Improvements:
- **Hero Section**: Floating metric panels with glassmorphism
- **Stats Strip**: Animated count-up effects
- **Capability Cards**: Glow and corner accents
- **GNN Flow**: Timeline connectors
- **Pipeline Cards**: Status chips with colors
- **Canvas**: Device pixel ratio, mobile optimization, pause on hidden
- **XAI Graph**: Pulse ring on target node
- **Accessibility**: Prefers-reduced-motion support throughout

---

## Testing Checklist

After integration, test these scenarios:

### Visual:
- [ ] Floating panels appear and float smoothly (desktop only)
- [ ] Stats count up from 0 when scrolled into view
- [ ] Cards have glow effect on hover
- [ ] Timeline connectors animate in
- [ ] Pulse ring animates on target node

### Responsive:
- [ ] Floating panels hidden on mobile/tablet (< 1280px)
- [ ] Canvas has fewer nodes on mobile
- [ ] Timeline switches to vertical on mobile
- [ ] Cards stack properly on small screens

### Performance:
- [ ] Canvas is crisp on high DPI screens
- [ ] Animations pause when tab is hidden
- [ ] No lag with multiple animations
- [ ] Smooth 60fps scrolling

### Accessibility:
- [ ] All animations disabled with prefers-reduced-motion
- [ ] Focus states visible on interactive elements
- [ ] Color contrast passes WCAG AA
- [ ] Keyboard navigation works

---

## Next Steps

1. Apply the changes from this guide to `LandingPage.jsx`
2. Test on localhost:5173
3. Check browser console for warnings/errors
4. Test responsive breakpoints
5. Test with reduced motion enabled
6. Verify dark mode looks good
7. Get feedback and iterate!

---

## Troubleshooting

### Floating panels not showing:
- Check screen width is > 1280px
- Verify CSS classes are loaded
- Check z-index conflicts

### Stats not counting up:
- Verify IntersectionObserver is supported
- Check scroll position triggers 30% threshold
- Ensure value prop is correct format

### Canvas looks blurry:
- Verify devicePixelRatio code is applied
- Check canvas dimensions match display size
- Clear cache and hard reload

### Animations too slow/fast:
- Adjust duration prop values
- Modify animation delay timings
- Check easing curves

Need help? Reference the CSS classes in `index.css` and component implementations!
