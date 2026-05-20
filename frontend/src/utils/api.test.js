import { describe, it, expect } from 'vitest'
import { API_BASE, WS_URL, apiUrl, parseJsonSafely, readApiResponse } from './api'

describe('api utility', () => {
  it('exposes a non-empty API_BASE', () => {
    expect(typeof API_BASE).toBe('string')
    expect(API_BASE.length).toBeGreaterThan(0)
  })

  it('exposes a WS_URL starting with ws:// or wss://', () => {
    expect(typeof WS_URL).toBe('string')
    expect(WS_URL).toMatch(/^wss?:\/\//)
  })

  it('apiUrl() concatenates a leading slash correctly', () => {
    expect(apiUrl('/datasets')).toBe(`${API_BASE}/datasets`)
    expect(apiUrl('datasets')).toBe(`${API_BASE}/datasets`)
  })

  it('apiUrl() returns API_BASE when called without args', () => {
    expect(apiUrl()).toBe(API_BASE)
  })

  it('parseJsonSafely() returns parsed objects and falls back for plain text', () => {
    expect(parseJsonSafely('{"ok":true}')).toEqual({ ok: true })
    expect(parseJsonSafely('Internal Server Error', 'fallback')).toBe('fallback')
  })

  it('readApiResponse() reads JSON and plain text responses safely', async () => {
    const jsonResponse = new Response(JSON.stringify({ detail: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    })
    const textResponse = new Response('Internal Server Error', {
      headers: { 'Content-Type': 'text/plain' },
    })

    await expect(readApiResponse(jsonResponse)).resolves.toEqual({ detail: 'ok' })
    await expect(readApiResponse(textResponse)).resolves.toBe('Internal Server Error')
  })
})
