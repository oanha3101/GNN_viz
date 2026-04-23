import { describe, it, expect } from 'vitest'
import { isNodeMisclassified, countMisclassified } from './misclassification'

describe('isNodeMisclassified', () => {
  it('returns true when node_correctness entry is false', () => {
    expect(isNodeMisclassified(2, [true, true, false, true])).toBe(true)
  })

  it('returns true when node_correctness entry is 0 (backend legacy int form)', () => {
    expect(isNodeMisclassified(0, [0, 1, 1])).toBe(true)
  })

  it('returns false for correctly classified nodes', () => {
    expect(isNodeMisclassified(1, [true, true, false])).toBe(false)
  })

  it('returns false when node_correctness is missing, empty, or not an array', () => {
    expect(isNodeMisclassified(0, null)).toBe(false)
    expect(isNodeMisclassified(0, undefined)).toBe(false)
    expect(isNodeMisclassified(0, [])).toBe(false)
    expect(isNodeMisclassified(0, 'nope')).toBe(false)
  })

  it('returns false when nodeId is out of range or invalid', () => {
    expect(isNodeMisclassified(99, [true, false])).toBe(false)
    expect(isNodeMisclassified(-1, [true, false])).toBe(false)
    expect(isNodeMisclassified(1.5, [true, false])).toBe(false)
    expect(isNodeMisclassified('1', [true, false])).toBe(false)
  })
})

describe('countMisclassified', () => {
  it('counts all false and 0 entries', () => {
    expect(countMisclassified([true, false, true, 0, 1, false])).toBe(3)
  })

  it('returns 0 for empty, null, or non-array input', () => {
    expect(countMisclassified([])).toBe(0)
    expect(countMisclassified(null)).toBe(0)
    expect(countMisclassified(undefined)).toBe(0)
    expect(countMisclassified('oops')).toBe(0)
  })
})
