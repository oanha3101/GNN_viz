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
  env.VITE_API_BASE_URL || '/api'

export const WS_URL =
  env.VITE_WS_URL || 'ws://localhost:8000/ws/train'

export function apiUrl(path = '') {
  if (!path) return API_BASE
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export function parseJsonSafely(value, fallback = null) {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  const text = await response.text()
  const parsed = parseJsonSafely(text)
  return parsed ?? text
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
  const payload = await readApiResponse(response)
  if (!response.ok) {
    const error = new Error(
      typeof payload === 'string' ? payload : payload.detail || 'Request failed'
    )
    error.status = response.status
    error.payload = payload
    throw error
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
