// Galaxy Constellation — Graph node & class color palette
// Each color is chosen to pop against the deep purple background
// while maintaining the cosmic aesthetic.

export const CLASS_COLORS = [
  '#9333ea', // amethyst — primary
  '#818cf8', // aurora-blue
  '#f472b6', // aurora-pink
  '#22d3ee', // aurora-cyan
  '#34d399', // aurora-green
  '#fbbf24', // aurora-amber
  '#f43f5e', // aurora-rose
  '#a78bfa', // moonlight
  '#6d28d9', // cosmic
  '#fb923c', // orange
  '#3b82f6', // blue
  '#2dd4bf', // teal
  '#e879f9', // fuchsia
  '#facc15', // yellow
  '#fb7185', // rose-light
  '#c084fc', // purple-light
  '#38bdf8', // sky
  '#4ade80', // green-light
  '#94a3b8', // slate
]

export function getClassColor(idx) {
  if (idx == null || idx === undefined || isNaN(idx)) return '#7c6faa'
  return CLASS_COLORS[idx % CLASS_COLORS.length]
}

export const CLASS_NAMES = [
  'Case Based', 'Genetic Algorithms', 'Neural Networks',
  'Probabilistic Methods', 'Reinforcement Learning', 'Rule Learning', 'Theory',
]

export const COMMUNITY_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ef4444', // red
  '#10b981', // emerald
]

export function getCommunityColor(idx) {
  if (idx == null || isNaN(idx)) return '#94a3b8'
  return COMMUNITY_COLORS[idx % COMMUNITY_COLORS.length]
}

export const MODEL_COLORS = {
  GCN: '#9333ea',   // amethyst
  GAT: '#818cf8',   // aurora-blue
  SAGE: '#f472b6',  // aurora-pink
}
