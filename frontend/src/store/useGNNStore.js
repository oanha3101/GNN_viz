import { create } from 'zustand'

const useGNNStore = create((set, get) => ({
  // ─── Config ──────────────────────────────────────────────────
  selectedTask: 1,
  selectedModel: 'GCN',
  mockMode: true,
  hyperparams: {
    epochs: 100,
    lr: 0.01,
    hidden: 64,
    dropout: 0.5,
    heads: 4,
    aggregator: 'mean',
  },

  // ─── Training state ──────────────────────────────────────────
  isTraining: false,
  trainingProgress: 0,

  // ─── Graph data ──────────────────────────────────────────────
  graphData: null,
  groundTruth: null,
  trainMask: null,
  taskData: null,

  // ─── Selection / UI ──────────────────────────────────────────
  selectedNodeId: null,
  hoveredGraphId: null,
  viewMode: 'prediction',
  attentionHead: 'avg',
  configOpen: false,
  reportOpen: false,

  // ─── Task 5 specific ────────────────────────────────────────
  task5Meta: null,     // { num_nodes, num_edges, has_features, feature_dim, has_labels, num_classes, ... }
  task5Exporting: false,

  // ─── Uploaded file path (for custom datasets) ───────────────
  uploadedFilePath: null,

  // ─── Actions: Config ─────────────────────────────────────────
  setTask: (task) => {
    const prevState = get()
    const needsReset = task === 2 || task === 6 || prevState.selectedTask === 2 || prevState.selectedTask === 6
    const leavingTask5 = prevState.selectedTask === 5
    
    set({
      selectedTask: task,
      isTraining: false,
      trainingProgress: 0,
      selectedNodeId: null,
      // Clear data only if moving to/from tasks with incompatible graph formats
      ...(needsReset ? {
        graphData: null,
        groundTruth: null,
        trainMask: null,
        taskData: null,
      } : {}),
      // Clear task 5 meta when leaving
      ...(leavingTask5 ? { task5Meta: null } : {}),
    })
  },
  setSelectedTask: (task) => get().setTask(task),
  setModel: (model) => {
    set({
      selectedModel: model,
      graphData: null,
      groundTruth: null,
      trainMask: null,
      taskData: null,
      selectedNodeId: null,
      isTraining: false,
      trainingProgress: 0,
    })
  },
  setMockMode: (mode) => set({ mockMode: mode }),
  setHyperparams: (params) => set((s) => ({ hyperparams: { ...s.hyperparams, ...params } })),

  // ─── Actions: Data ───────────────────────────────────────────
  setGraphData: (gd) => set({ graphData: gd }),
  setGroundTruth: (gt) => set({ groundTruth: gt }),
  setTrainMask: (mask) => set({ trainMask: mask }),
  setTaskData: (td) => set({ taskData: td }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),

  addInductiveNode: (newNode) => {
    const { graphData } = get()
    if (!graphData) return

    const flavoredNode = {
      ...newNode,
      x: -500,
      y: -500,
      fx: null,
      fy: null,
      isInductive: true,
      degree: newNode.links.length
    }

    const newLinks = newNode.links.map((targetId, i) => ({
      source: newNode.id,
      target: targetId,
      _idx: graphData.links.length + i,
      isInductive: true
    }))

    set({
      graphData: {
        nodes: [...graphData.nodes, flavoredNode],
        links: [...graphData.links, ...newLinks]
      },
      selectedNodeId: newNode.id
    })
  },

  // ─── Actions: UI ─────────────────────────────────────────────
  setHoveredGraph: (id) => set({ hoveredGraphId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setAttentionHead: (head) => set({ attentionHead: head }),
  setConfigOpen: (open) => set({ configOpen: open }),
  setReportOpen: (open) => set({ reportOpen: open }),
  setTraining: (isTraining, progress) => set({ isTraining, trainingProgress: progress ?? 0 }),

  // ─── Task 5 Actions ────────────────────────────────────────
  setTask5Meta: (meta) => set({ task5Meta: meta }),
  setTask5Exporting: (v) => set({ task5Exporting: v }),
  setUploadedFilePath: (path) => set({ uploadedFilePath: path }),
}))

export default useGNNStore
