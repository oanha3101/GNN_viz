# GNN-Insight Landing Page Premium Upgrade Plan

## 🎯 Overview
Transform the landing page into a premium, cinematic AI research product with glassmorphism, dark research lab aesthetic, crimson/magenta neon accents, and sophisticated motion design.

## ✅ Upgrade Checklist

### PHASE 1: Enhanced Motion System
- [x] Create professional motion variants with consistent easing `[0.22, 1, 0.36, 1]`
- [x] Add magnetic hover effects
- [x] Implement parallax effects
- [ ] Add prefers-reduced-motion support
- [ ] Optimize animations with `once` viewport flag

### PHASE 2: Hero Section Enhancement
**Left Column:**
- [ ] Animated shimmer on eyebrow
- [ ] Premium gradient text on H1
- [ ] Magnetic hover on primary CTA
- [ ] Ghost button enhancement

**Right Column:**
- [ ] Add floating metric panels (Attention Score, Live Epoch, Node Influence)
- [ ] Browser mockup depth enhancement
- [ ] Workspace graphic animations (heatmap pulse, progress bars)
- [ ] Parallax floating panels
- [ ] Mobile responsiveness for floating panels

### PHASE 3: Background Optimization
- [ ] Canvas devicePixelRatio support
- [ ] Reduce nodes on mobile
- [ ] Pause animation when document hidden
- [ ] Radial spotlight after hero
- [ ] Respect prefers-reduced-motion

### PHASE 4: Stats Strip Premium
- [ ] Count-up animation on scroll into viewport
- [ ] Special handling for "∞" and "100%"
- [ ] Mini indicator bars
- [ ] Premium hover effects

### PHASE 5: Research Capabilities Cards
- [ ] Gradient border on hover
- [ ] Icon glow effect
- [ ] Corner accent details
- [ ] Text hierarchy improvement
- [ ] Responsive grid (1/2/4 columns)

### PHASE 6: How GNN Learns Timeline
- [ ] Horizontal flow with animated connector (desktop)
- [ ] Vertical timeline (mobile)
- [ ] Formula styling enhancement
- [ ] Step number badges
- [ ] Animation on section viewport entry

### PHASE 7: XAI Showcase Interactive Demo
- [ ] Node hover highlights edges
- [ ] Target node pulse ring
- [ ] Animated packets on influential edges
- [ ] Dynamic explanation panel content
- [ ] Progress bar animations

### PHASE 8: Research Pipeline
- [ ] Step-by-step cards with connectors
- [ ] Hover lift effects
- [ ] Icon glow
- [ ] Status chips (Dataset Ready, Training, etc.)
- [ ] Mobile optimization

### PHASE 9: Final CTA Premium
- [ ] Dark gradient background
- [ ] Crimson/magenta glow
- [ ] Glass border effect
- [ ] Enhanced CTA buttons
- [ ] Enterprise/research aesthetic

### PHASE 10: Code Quality & Performance
- [ ] Component extraction (separate files if needed)
- [ ] useMemo for static arrays
- [ ] React.memo for heavy components
- [ ] Remove unused state
- [ ] ESLint warnings cleanup

### PHASE 11: Accessibility
- [ ] Canvas aria-hidden
- [ ] Focus-visible rings
- [ ] Color contrast (dark/light)
- [ ] Motion preferences
- [ ] SVG interactive elements accessibility
- [ ] Minimum font sizes on mobile

## 📦 New Components to Extract
1. `FloatingMetricPanel` - Floating stat panels around hero
2. `CountUpStat` - Animated count-up statistics
3. `PremiumCard` - Enhanced capability cards
4. `TimelineFlow` - GNN learning flow
5. `InteractiveXAIDemo` - XAI showcase
6. `PipelineStep` - Pipeline cards

## 🎨 New CSS Classes Needed
```css
/* Shimmer effect */
.shimmer-effect { ... }

/* Magnetic hover */
.magnetic-hover { ... }

/* Floating panel */
.floating-panel { ... }

/* Pulse ring */
.pulse-ring { ... }

/* Glow effect */
.glow-effect { ... }
```

## 🔑 Key i18n Keys to Add (if needed)
- `landing.hero_floating_attention`
- `landing.hero_floating_epoch`
- `landing.hero_floating_influence`
- `landing.pipeline_status_ready`
- `landing.pipeline_status_training`
- `landing.pipeline_status_completed`

## ⚡ Performance Optimizations
1. Lazy load heavy components
2. Debounce mouse parallax
3. RAF for smooth animations
4. Intersection Observer for viewport animations
5. Canvas optimization (reduced nodes on mobile)

## 📱 Responsive Breakpoints
- Mobile: < 640px (1 column)
- Tablet: 640-1024px (2 columns)
- Desktop: > 1024px (4 columns, full features)

## 🎭 Motion Easing
All animations use: `cubic-bezier(0.22, 1, 0.36, 1)`
