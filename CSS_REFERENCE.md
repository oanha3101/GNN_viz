# CSS Classes Quick Reference

## 🎨 Premium Landing Classes

### Core Effects

#### Shimmer Text
```css
.shimmer-text
```
- Animated gradient shimmer
- 3s linear infinite
- Use on: Eyebrow badges, headings
```html
<span class="shimmer-text">Premium Feature</span>
```

#### Magnetic Hover
```css
.magnetic-hover
```
- Smooth translateY(-2px) on hover
- Cubic-bezier easing
- Use on: CTA buttons, cards
```html
<button class="landing-btn-primary magnetic-hover">Click Me</button>
```

#### Glow Effect
```css
.glow-effect
```
- Gradient border glow on hover
- 8px blur radius
- Use on: Cards, buttons, icons
```html
<div class="landing-card glow-effect">...</div>
```

#### Corner Accent
```css
.corner-accent
```
- Triangle accent top-right corner
- Fades in on hover
- Use on: Cards, panels
```html
<div class="pipeline-card corner-accent">...</div>
```

---

### Floating Panels

#### Base Panel
```css
.floating-panel
```
- Glassmorphic background
- 6s float animation
- Backdrop blur 20px
- Hidden < 1280px

#### Positions
```css
.floating-panel--top-left
.floating-panel--top-right
.floating-panel--bottom-right
```

#### Panel Elements
```css
.floating-panel__label    /* Uppercase label */
.floating-panel__value    /* Gradient value */
.floating-panel__sublabel /* Muted sublabel */
```

**Example:**
```html
<div class="floating-panel floating-panel--top-right">
  <div class="floating-panel__label">ATTENTION</div>
  <div class="floating-panel__value">94.8%</div>
  <div class="floating-panel__sublabel">XAI Confidence</div>
</div>
```

---

### Animations

#### Pulse Ring
```css
.pulse-ring
```
- Expanding circle animation
- 2s infinite
- Use on: Target nodes, indicators
```html
<circle class="pulse-ring" cx="100" cy="100" r="20" />
```

#### Count-up
```css
.count-up
```
- Fade in + translateY animation
- 0.6s duration
- Use on: Stat numbers
```html
<div class="landing-stat-number count-up">42</div>
```

#### Animated Progress
```css
.animated-progress
```
- Width fill animation
- 1.5s duration
- Use on: Progress bars
```html
<div class="animated-progress" style="width: 75%"></div>
```

#### Heatmap Cell
```css
.heatmap-cell
```
- Staggered pulse animation
- 2s ease-in-out infinite
- Use on: Heatmap grid cells
```html
<div class="heatmap-cell" style="animation-delay: 0.2s"></div>
```

#### Data Packet
```css
.data-packet
```
- Flow along path animation
- 3s infinite with fade
- Use on: SVG circles on edges
```html
<circle class="data-packet" r="3">
  <animateMotion dur="3s" repeatCount="indefinite" path="M 0 0 L 100 100" />
</circle>
```

---

### Layout Components

#### Glass Card
```css
.glass-card
```
- Enhanced glassmorphism
- Gradient top border
- Hover lift + glow
- 24px border radius
```html
<div class="glass-card">
  <h3>Premium Content</h3>
  <p>Description here...</p>
</div>
```

#### Interactive Node
```css
.interactive-node
```
- Brightness hover effect
- 0.3s transition
- Use on: Graph nodes, points
```html
<g class="interactive-node">
  <circle cx="50" cy="50" r="10" />
</g>
```

---

### Timeline & Flow

#### Timeline Connector
```css
.timeline-connector
```
- Horizontal gradient line
- Animated reveal on viewport
- Hidden on mobile
- Use on: Flow steps
```html
<div class="timeline-connector"></div>
```

---

### XAI Components

#### XAI Panel
```css
.xai-panel
.xai-panel__header
```
- Glassmorphic container
- Top header section
- Dark mode optimized
```html
<div class="xai-panel">
  <div class="xai-panel__header">
    <Search size={14} />
    <span>Explanation Panel</span>
  </div>
  <div class="p-6">Content...</div>
</div>
```

#### Feature Bar
```css
.xai-feature-bar
.xai-feature-bar__fill
```
- Horizontal progress bar
- Gradient fill animation
- 800ms cubic-bezier
```html
<div class="xai-feature-bar">
  <div class="xai-feature-bar__fill" style="width: 84%"></div>
</div>
```

---

### Pipeline Components

#### Pipeline Card
```css
.pipeline-card
.pipeline-card__dot
```
- Premium step card
- Icon dot with glow
- Hover lift effect
```html
<div class="pipeline-card glow-effect corner-accent">
  <div class="pipeline-card__dot glow-effect">
    <Database size={20} />
  </div>
  <div>
    <h3>Step Title</h3>
    <p>Description...</p>
  </div>
</div>
```

---

### Background Effects

#### Hero Spotlight
```css
.hero-spotlight
```
- Radial gradient glow
- Positioned after hero
- Crimson accent
```html
<div class="hero-spotlight"></div>
```

---

### Enhanced Existing Classes

#### Landing Stat Bar
```css
.landing-stat-bar
```
- Now with gradient
- Grows on hover (48px → 64px)
- Glow shadow effect
```html
<div class="landing-stat-bar"></div>
```

---

## 🎯 Usage Patterns

### Hero Section
```html
<div class="relative">
  <!-- Floating panels -->
  <div class="floating-panel floating-panel--top-right">...</div>
  
  <!-- Browser mockup -->
  <div class="glass-card magnetic-hover">...</div>
  
  <!-- Spotlight -->
  <div class="hero-spotlight"></div>
</div>
```

### Stats Strip
```html
<div class="glass-card">
  <div class="landing-stat-number count-up">42</div>
  <div class="landing-stat-label">GNN Tasks</div>
  <div class="landing-stat-bar"></div>
</div>
```

### Capability Cards
```html
<div class="landing-card landing-card-accent glow-effect corner-accent">
  <div class="landing-card-icon glow-effect">
    <Network size={18} />
  </div>
  <h3>Title</h3>
  <p>Description</p>
</div>
```

### GNN Flow Steps
```html
<div class="gnn-flow-step relative">
  <div class="flex items-center gap-3">
    <div class="w-8 h-8 rounded-lg glow-effect">
      <Brain size={16} />
    </div>
    <span>Step 01</span>
  </div>
  <h4>Message Passing</h4>
  <p>Description...</p>
  
  <!-- Connector (desktop only) -->
  <div class="timeline-connector"></div>
</div>
```

### XAI Graph
```html
<svg viewBox="0 0 400 240">
  <!-- Target node with pulse -->
  <circle class="pulse-ring" cx="200" cy="120" r="20" />
  
  <!-- Interactive nodes -->
  <g class="interactive-node">
    <circle cx="200" cy="120" r="9" />
  </g>
  
  <!-- Data packets -->
  <circle class="data-packet" r="3" fill="#FF3366">
    <animateMotion dur="2s" repeatCount="indefinite" path="..." />
  </circle>
</svg>
```

### Pipeline Cards
```html
<div class="pipeline-card glow-effect corner-accent">
  <div class="pipeline-card__dot glow-effect">
    <Database size={20} />
  </div>
  <div>
    <div class="flex items-center gap-2">
      <span class="text-[11px] font-mono text-crimson">STEP 01</span>
      <span class="status-chip">Ready</span>
    </div>
    <h3>Dataset Upload</h3>
    <p>Description...</p>
  </div>
</div>
```

---

## ♿ Accessibility

### Prefers Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  .shimmer-text,
  .floating-panel,
  .pulse-ring,
  .data-packet,
  .heatmap-cell,
  .timeline-connector,
  .animated-progress {
    animation: none !important;
  }
  
  .magnetic-hover:hover,
  .glass-card:hover {
    transform: none !important;
  }
}
```

**Auto-applied to all animations!**

---

## 🎨 Color Tokens

```css
/* Crimson/Magenta Gradient */
--aurora-crimson: #FF3366
--aurora-magenta: #D946EF
--aurora-gradient: linear-gradient(135deg, #FF3366, #D946EF)

/* Neutrals */
--slate-500: #64748b
--slate-400: #94a3b8
--slate-300: #cbd5e1

/* Success/Error */
--success: #22C55E
--warning: #F97316
--error: #DC2626
```

---

## 📐 Spacing & Sizing

### Border Radius
```css
Small: 8px
Medium: 12-16px
Large: 20-24px
XL: 32px
```

### Shadows
```css
/* Soft */
0 8px 32px rgba(0,0,0,0.08)

/* Medium */
0 20px 60px rgba(0,0,0,0.08)

/* Glow */
0 0 20px rgba(255,51,102,0.25)
```

### Animation Timing
```css
/* Easing (all animations) */
cubic-bezier(0.22, 1, 0.36, 1)

/* Durations */
Fast: 0.3s
Medium: 0.6s - 0.8s
Slow: 1.5s - 2s
Loop: 2s - 6s infinite
```

---

## 📱 Responsive Utilities

### Breakpoints
```css
/* Mobile First */
@media (max-width: 640px)  { /* Mobile */ }
@media (max-width: 1024px) { /* Tablet */ }
@media (max-width: 1280px) { /* Desktop */ }
```

### Visibility
```css
/* Floating panels hidden < 1280px */
@media (max-width: 1280px) {
  .floating-panel { display: none; }
}

/* Timeline connector hidden < 1024px */
@media (max-width: 1023px) {
  .timeline-connector { display: none; }
}
```

---

## 🔧 Customization

### Adjust Float Animation Speed
```css
.floating-panel {
  animation: float 6s ease-in-out infinite;
  /* Change 6s to 4s for faster, 8s for slower */
}
```

### Adjust Pulse Ring Size
```css
@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(255, 51, 102, 0.4); }
  70% { box-shadow: 0 0 0 16px rgba(255, 51, 102, 0); }
  /* Change 16px to adjust ring expansion */
}
```

### Adjust Shimmer Speed
```css
.shimmer-text {
  animation: shimmer 3s linear infinite;
  /* Change 3s to 2s for faster, 4s for slower */
}
```

---

## 🚀 Performance Tips

1. **Use `will-change` sparingly**:
```css
.frequently-animated {
  will-change: transform;
}
```

2. **Prefer `transform` over `left/top`**:
```css
/* ❌ Bad */
.element { left: 10px; }

/* ✅ Good */
.element { transform: translateX(10px); }
```

3. **Use `contain` for isolated animations**:
```css
.animated-section {
  contain: layout style paint;
}
```

---

## ✅ Checklist

Before using a class, verify:

- [ ] Class name spelled correctly
- [ ] Required parent/child structure
- [ ] Responsive behavior understood
- [ ] Dark mode checked
- [ ] Reduced motion considered
- [ ] Browser support (IE11 not supported)

---

**That's it! You now have a complete CSS reference for the premium landing page. 🎉**

Quick links:
- Full implementation: `INTEGRATION_GUIDE.md`
- Component docs: `LANDING_UPGRADES_SUMMARY.md`
- Quick start: `START_HERE.md`
