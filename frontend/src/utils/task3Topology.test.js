import { describe, expect, it } from 'vitest'
import {
  buildTask3FocusContext,
  clampTask3Zoom,
  getTask3NodeRadius,
  selectTask3OverlayEdgeIndexes,
  shouldAutoFocusTask3,
  shouldShowTask3EdgeLabel,
  shouldShowTask3NodeLabel,
} from './task3Topology'

describe('selectTask3OverlayEdgeIndexes', () => {
  it('prioritizes high-score future links and weak positive links', () => {
    const result = selectTask3OverlayEdgeIndexes({
      testEdges: [
        { source: 0, target: 1, exists: false },
        { source: 1, target: 2, exists: true },
        { source: 2, target: 3, exists: false },
      ],
      scoreA: [0.91, 0.22, 0.35],
      scoreB: [0.95, 0.18, 0.4],
      t: 0.5,
      limit: 2,
    })

    expect(result).toEqual([0, 1])
  })

  it('keeps the focused edge visible even when it is not top ranked', () => {
    const result = selectTask3OverlayEdgeIndexes({
      testEdges: [
        { source: 0, target: 1, exists: false },
        { source: 1, target: 2, exists: false },
        { source: 2, target: 3, exists: true },
      ],
      scoreA: [0.9, 0.8, 0.99],
      focusedEdgeIdx: 1,
      limit: 1,
    })

    expect(result).toEqual([1])
  })

  it('filters to the selected node neighborhood when one is active', () => {
    const result = selectTask3OverlayEdgeIndexes({
      testEdges: [
        { source: 0, target: 1, exists: false },
        { source: 4, target: 5, exists: false },
        { source: 1, target: 3, exists: true },
      ],
      scoreA: [0.95, 0.99, 0.15],
      selectedNodeId: 1,
      limit: 5,
    })

    expect(result).toEqual([0, 2])
  })
})

describe('Task 3 camera + scale helpers', () => {
  it('suppresses auto focus while a manual camera hold is active', () => {
    expect(
      shouldAutoFocusTask3({
        isTraining: true,
        anchorIdx: 2,
        manualHoldUntil: 1500,
        now: 1200,
      }),
    ).toBe(false)
  })

  it('suppresses repeated auto focus when the anchor has not changed', () => {
    expect(
      shouldAutoFocusTask3({
        isTraining: true,
        anchorIdx: 2,
        previousFocusKey: '2',
        now: 2000,
      }),
    ).toBe(false)
  })

  it('allows auto focus when training is active and the anchor changed', () => {
    expect(
      shouldAutoFocusTask3({
        isTraining: true,
        anchorIdx: 3,
        previousFocusKey: '1',
        now: 2000,
      }),
    ).toBe(true)
  })

  it('clamps zoom into the calmer task 3 range', () => {
    expect(clampTask3Zoom(0.1)).toBe(0.45)
    expect(clampTask3Zoom(2.5)).toBe(1.5)
    expect(clampTask3Zoom(1.1)).toBe(1.1)
  })

  it('caps node radius so dense hubs do not dominate the canvas', () => {
    expect(getTask3NodeRadius({ degree: 1 })).toBeCloseTo(3.7, 1)
    expect(getTask3NodeRadius({ degree: 400 })).toBe(8)
    expect(getTask3NodeRadius({ degree: 4, isSelected: true })).toBeGreaterThan(
      getTask3NodeRadius({ degree: 4 }),
    )
  })

  it('shows node labels only for high-zoom or explicit focus cases', () => {
    expect(
      shouldShowTask3NodeLabel({
        globalScale: 1,
        showBulkNodeLabels: false,
        isSelected: false,
        isCommonNeighbor: false,
      }),
    ).toBe(false)

    expect(
      shouldShowTask3NodeLabel({
        globalScale: 2.2,
        showBulkNodeLabels: false,
        isSelected: false,
        isCommonNeighbor: false,
      }),
    ).toBe(true)
  })

  it('shows edge labels only for focused edges or local guided views', () => {
    expect(
      shouldShowTask3EdgeLabel({
        isFocused: false,
        isPrimary: true,
        selectedNodeId: null,
        hoveredLink: null,
        scale: 1,
      }),
    ).toBe(false)

    expect(
      shouldShowTask3EdgeLabel({
        isFocused: true,
        isPrimary: false,
        selectedNodeId: null,
        hoveredLink: null,
        scale: 0.8,
      }),
    ).toBe(true)
  })
})

describe('buildTask3FocusContext', () => {
  it('collects endpoints, mutual neighbors, and path nodes for the focused edge', () => {
    const context = buildTask3FocusContext({
      graphData: {
        nodes: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
        links: [
          { source: 1, target: 3 },
          { source: 2, target: 3 },
          { source: 1, target: 4 },
          { source: 4, target: 2 },
        ],
      },
      testEdges: [{ source: 1, target: 2, exists: false }],
      focusedEdgeIdx: 0,
    })

    expect(context.hasFocus).toBe(true)
    expect(context.endpointNodes.has(1)).toBe(true)
    expect(context.endpointNodes.has(2)).toBe(true)
    expect(context.mutualNeighbors.has(3)).toBe(true)
    expect(context.pathNodes.has(3)).toBe(true)
  })
})
