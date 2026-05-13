// GNN-Insight Design Tokens v2 — Galaxy Constellation
//
// Single source of truth. Every color, spacing, shadow, and animation
// used across the app traces back to this file.
// Tailwind config mirrors these tokens for utility-class access.

export const color = {
  // ── Deep Space (Background layers) ──
  bg: {
    void: '#050210',        // canvas — near-absolute black with purple
    abyss: '#0a0519',       // main background
    deep: '#0e0822',        // panel base
    nebula: '#140d30',      // card / elevated panel
    dust: '#1a1240',        // surface / interactive area
    cloud: '#221850',       // hover state surface
    glass: 'rgba(14, 8, 34, 0.65)',
    glassHover: 'rgba(20, 13, 48, 0.75)',
  },

  // ── Stellar Accents (Primary action colors) ──
  accent: {
    amethyst: '#9333ea',    // primary CTA, focus ring
    nebulaCore: '#7c3aed',  // active state, selection
    cosmic: '#6d28d9',      // pressed, deep accent
    amethystSoft: 'rgba(147, 51, 234, 0.12)',
    amethystMedium: 'rgba(147, 51, 234, 0.25)',
  },

  // ── Aurora Spectrum (Secondary / semantic accents) ──
  aurora: {
    blue: '#818cf8',        // links, info, edge highlights
    cyan: '#22d3ee',        // data metrics, numeric highlights
    pink: '#f472b6',        // warnings, supernova effects
    green: '#34d399',       // success, confirmed states
    amber: '#fbbf24',       // caution, solar flare
    rose: '#f43f5e',        // error, critical
    blueSoft: 'rgba(129, 140, 248, 0.12)',
    cyanSoft: 'rgba(34, 211, 238, 0.10)',
    pinkSoft: 'rgba(244, 114, 182, 0.10)',
    greenSoft: 'rgba(52, 211, 153, 0.10)',
  },

  // ── Starlight (Text hierarchy) ──
  text: {
    whiteStar: '#f0eeff',   // headings — cold white
    starlight: '#c4b5fd',   // body text primary
    moonlight: '#a78bfa',   // secondary, labels
    twilight: '#7c6faa',    // muted, placeholder
    shadow: '#4c3d80',      // disabled, hint text
    inverse: '#050210',     // light-on-dark inverse
  },

  // ── Constellation Lines (Borders & dividers) ──
  line: {
    subtle: 'rgba(139, 92, 246, 0.06)',
    default: 'rgba(139, 92, 246, 0.15)',
    active: 'rgba(139, 92, 246, 0.35)',
    glow: 'rgba(139, 92, 246, 0.50)',
  },

  // ── Legacy compat (mapped to new tokens) ──
  // Components still referencing old names continue to work.
  status: {
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f43f5e',
    info: '#818cf8',
  },
}

// ── Gradients ──
export const gradient = {
  nebulaFlow: 'linear-gradient(135deg, #9333ea, #818cf8)',
  supernova: 'linear-gradient(135deg, #f472b6, #9333ea)',
  deepCosmic: 'linear-gradient(135deg, #6d28d9, #818cf8)',
  auroraShimmer: 'linear-gradient(135deg, #22d3ee, #34d399)',
  voidFade: 'linear-gradient(180deg, #050210, #0e0822, #140d30)',
  textAccent: 'linear-gradient(135deg, #9333ea, #818cf8)',
}

// 8px baseline grid.
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
}

export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
}

// Typography
export const font = {
  family: {
    sans: '"Space Grotesk", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", monospace',
  },
  size: {
    nano: 9,
    micro: 10,
    xs: 11,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  },
  tracking: {
    tight: '-0.02em',
    normal: '0',
    wide: '0.02em',
    ultra: '0.1em',
    uppercase: '0.12em',
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
}

// Shadows — glow system (sm, md, lg)
export const shadow = {
  glow: {
    sm: '0 0 8px rgba(147, 51, 234, 0.2), 0 0 24px rgba(147, 51, 234, 0.06)',
    md: '0 0 16px rgba(147, 51, 234, 0.3), 0 0 48px rgba(147, 51, 234, 0.1)',
    lg: '0 0 24px rgba(147, 51, 234, 0.4), 0 0 80px rgba(147, 51, 234, 0.15)',
  },
  aurora: {
    sm: '0 0 8px rgba(129, 140, 248, 0.2), 0 0 24px rgba(129, 140, 248, 0.06)',
    md: '0 0 16px rgba(129, 140, 248, 0.3), 0 0 48px rgba(129, 140, 248, 0.1)',
    lg: '0 0 24px rgba(129, 140, 248, 0.4), 0 0 80px rgba(129, 140, 248, 0.15)',
  },
  depth: {
    sm: '0 2px 8px rgba(0, 0, 0, 0.3)',
    md: '0 4px 16px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
  // Combined: depth + glow
  panel: {
    sm: '0 2px 8px rgba(0,0,0,0.3), 0 0 8px rgba(147,51,234,0.06)',
    md: '0 4px 16px rgba(0,0,0,0.4), 0 0 16px rgba(147,51,234,0.08)',
    lg: '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(147,51,234,0.12)',
  },
}

export const z = {
  base: 0,
  panel: 10,
  overlay: 40,
  drawer: 50,
  modal: 60,
  toast: 70,
  tooltip: 80,
}

export const duration = {
  instant: 100,
  fast: 150,
  base: 200,
  slow: 300,
  lazy: 500,
  cosmic: 800,
}

export const tokens = { color, gradient, space, radius, font, shadow, z, duration }

export default tokens
