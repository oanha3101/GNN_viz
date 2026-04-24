/**
 * UI Store — selection, hover, view mode, panel toggles.
 * Split from monolith useGNNStore for domain separation.
 */
import { create } from 'zustand';

const useUIStore = create((set, get) => ({
  // Selection state
  selectedNodeId: null,
  selectedTargetNodeId: null,
  hoveredNodeId: null,
  hoveredGraphId: null,
  selectedCommunityId: null,
  focusedEdgeIdx: null,
  outlierPulseIdx: null,

  // View settings
  viewMode: 'prediction',
  attentionHead: 'avg',
  task6FilterMode: 'all',

  // Panel toggles
  configOpen: false,
  reportOpen: false,
  task5Exporting: false,

  // Actions
  setSelectedNode: (id) => {
    const current = get().selectedNodeId;
    if (current !== id) {
      set({ selectedNodeId: id, selectedTargetNodeId: null });
    } else {
      set({ selectedNodeId: id });
    }
  },
  setSelectedTargetNode: (id) => set({ selectedTargetNodeId: id }),
  setHoveredNode: (id) => set({ hoveredNodeId: id }),
  setHoveredGraph: (id) => set({ hoveredGraphId: id }),
  setSelectedCommunity: (id) => set({ selectedCommunityId: id }),
  setFocusedEdge: (idx) => set({ focusedEdgeIdx: idx }),
  setOutlierPulse: (idx) => set({ outlierPulseIdx: idx }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setAttentionHead: (head) => set({ attentionHead: head }),
  setTask6FilterMode: (mode) => set({ task6FilterMode: mode || 'all' }),
  setConfigOpen: (open) => set({ configOpen: open }),
  setReportOpen: (open) => set({ reportOpen: open }),
  setTask5Exporting: (v) => set({ task5Exporting: v }),

  /**
   * Reset selection state (used when switching tasks/models).
   */
  resetSelection: () => set({
    selectedNodeId: null,
    selectedTargetNodeId: null,
    hoveredNodeId: null,
    hoveredGraphId: null,
    selectedCommunityId: null,
    focusedEdgeIdx: null,
    outlierPulseIdx: null,
  }),
}));

export default useUIStore;
