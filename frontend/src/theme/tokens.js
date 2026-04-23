// GNN-Insight design tokens.
//
// Single source of truth for color, spacing, radius, z-index, and typography.
// Prefer these tokens over arbitrary Tailwind values (e.g. `text-[7px]`, `w-[380px]`).
// As Phase 2 of the FE refactor rolls out, arbitrary values will be disallowed
// by `fe-consistency-guard`.

export const color = {
  // Backgrounds (dark-mode only for now)
  bg: {
    canvas: '#020617',
    panel: '#050c19',
    panelSoft: '#071120',
    surface: '#0b1224',
    divider: '#1e293b',
  },
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    muted: '#64748b',
    faint: '#475569',
    inverse: '#020617',
  },
  // Single primary accent + one supporting accent. No gradients.
  accent: {
    primary: '#06b6d4', // cyan-500 — used for focus, selection, CTA
    primarySoft: 'rgba(6, 182, 212, 0.15)',
    secondary: '#6366f1', // indigo-500 — used for model / attention highlights
    secondarySoft: 'rgba(99, 102, 241, 0.15)',
  },
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
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
  full: 9999,
}

// Typography — clear hierarchy, no more `text-[7px]`.
export const font = {
  family: {
    sans: 'Inter, system-ui, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", monospace',
  },
  size: {
    nano: 9,     // badges / tiny labels
    micro: 10,   // uppercase labels
    xs: 11,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  },
  tracking: {
    tight: '-0.01em',
    normal: '0',
    wide: '0.1em',
    ultra: '0.2em',
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
  fast: 150,
  base: 200,
  slow: 300,
  lazy: 500,
}

export const tokens = { color, space, radius, font, z, duration }

export default tokens
