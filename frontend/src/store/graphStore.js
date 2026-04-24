/**
 * Graph Store — graph data, ground truth, task-specific data.
 * Split from monolith useGNNStore for domain separation.
 */
import { create } from 'zustand';

const useGraphStore = create((set, get) => ({
  graphData: null,
  groundTruth: null,
  trainMask: null,
  taskData: null,

  // Task-specific upload data
  communityGroundTruth: null,
  numCommunities: null,
  referenceGraph: null,
  uploadedFilePath: null,
  uploadMetadata: null,
  taskConfig: null,

  // Task 5 specific
  task5Meta: null,

  // Actions
  setGraphData: (gd) => set({ graphData: gd }),
  setGroundTruth: (gt) => set({ groundTruth: gt }),
  setTrainMask: (mask) => set({ trainMask: mask }),
  setTaskData: (td) => set({ taskData: td }),
  setTask5Meta: (meta) => set({ task5Meta: meta }),
  setUploadedFilePath: (path) => set({ uploadedFilePath: path }),
  setCommunityGroundTruth: (gt) => set({ communityGroundTruth: gt }),
  setNumCommunities: (n) => set({ numCommunities: n }),
  setReferenceGraph: (g) => set({ referenceGraph: g }),
  setUploadMetadata: (meta) => set({ uploadMetadata: meta }),
  setTaskConfig: (cfg) => set({ taskConfig: cfg }),

  /**
   * Clear all graph data (used when switching tasks).
   */
  clearGraphData: () => set({
    graphData: null,
    groundTruth: null,
    trainMask: null,
    taskData: null,
    communityGroundTruth: null,
    numCommunities: null,
    referenceGraph: null,
    task5Meta: null,
  }),
}));

export default useGraphStore;
