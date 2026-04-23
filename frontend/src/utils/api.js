// Centralised API / WebSocket base URLs.
//
// Configure via Vite env vars (`frontend/.env`):
//   VITE_API_BASE_URL   (default: "http://localhost:8000/api")
//   VITE_WS_URL         (default: "ws://localhost:8000/ws/train")
//
// Never hard-code backend URLs in component files — import from here instead.

const env =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}

export const API_BASE =
  env.VITE_API_BASE_URL || 'http://localhost:8000/api'

export const WS_URL =
  env.VITE_WS_URL || 'ws://localhost:8000/ws/train'

export function apiUrl(path = '') {
  if (!path) return API_BASE
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}
