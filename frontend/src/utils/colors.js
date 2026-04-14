export const CLASS_COLORS = [
  '#E53935', '#1E88E5', '#43A047', '#FB8C00',
  '#8E24AA', '#E91E63', '#F9A825',
  '#00ACC1', '#43A047', '#F4511E', '#3949AB',
  '#8E24AA', '#00897B', '#C0CA33', '#FBC02D',
  '#039BE5', '#546E7A', '#D81B60', '#5E35B1'
]

export function getClassColor(idx) {
  if (idx == null || idx === undefined || isNaN(idx)) return '#94a3b8';
  return CLASS_COLORS[idx % CLASS_COLORS.length];
}

export const CLASS_NAMES = [
  'Case Based', 'Genetic Algorithms', 'Neural Networks',
  'Probabilistic Methods', 'Reinforcement Learning', 'Rule Learning', 'Theory',
]

export const MODEL_COLORS = {
  GCN: '#3b82f6',
  GAT: '#22c55e',
  SAGE: '#f97316',
}
