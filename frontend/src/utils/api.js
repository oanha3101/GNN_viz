// Centralised API / WebSocket base URLs.
//
// Configure via Vite env vars (`frontend/.env`):
//   VITE_API_BASE_URL   (default: "http://localhost:8000/api")
//   VITE_WS_URL         (default: "ws://localhost:8000/ws/train")
//
// Never hard-code backend URLs in component files — import from here instead.

const env =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}

export const AUTH_TOKEN_KEY = 'gnn_access_token'

export const API_BASE =
  env.VITE_API_BASE_URL || 'http://localhost:8000/api'

export const WS_URL =
  env.VITE_WS_URL || 'ws://localhost:8000/ws/train'

export function apiUrl(path = '') {
  if (!path) return API_BASE
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export function getAuthHeaders() {
  if (typeof localStorage === 'undefined') return {}
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.detail || 'Request failed')
  }
  return payload
}

export function normalizeCollectionPayload(payload) {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      total: payload.length,
      page: 1,
      page_size: payload.length,
    }
  }

  const items = Array.isArray(payload?.items) ? payload.items : []
  return {
    items,
    total: typeof payload?.total === 'number' ? payload.total : items.length,
    page: typeof payload?.page === 'number' ? payload.page : 1,
    page_size: typeof payload?.page_size === 'number' ? payload.page_size : items.length,
  }
}
