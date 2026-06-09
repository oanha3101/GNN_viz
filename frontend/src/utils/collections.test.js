import { describe, expect, it } from 'vitest'
import { normalizeCollectionPayload } from './api'

describe('normalizeCollectionPayload', () => {
  it('normalizes bare arrays into the list contract shape', () => {
    const payload = [{ id: 1 }, { id: 2 }]
    expect(normalizeCollectionPayload(payload)).toEqual({
      items: payload,
      total: 2,
      page: 1,
      page_size: 2,
    })
  })

  it('preserves explicit list contract fields when present', () => {
    const payload = {
      items: [{ id: 9 }],
      total: 33,
      page: 2,
      page_size: 10,
    }
    expect(normalizeCollectionPayload(payload)).toEqual(payload)
  })

  it('wraps missing items safely for non-list payloads', () => {
    expect(normalizeCollectionPayload({})).toEqual({
      items: [],
      total: 0,
      page: 1,
      page_size: 0,
    })
  })
})
