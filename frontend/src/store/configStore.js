/**
 * Config Store — task/model/hyperparams selection.
 * Split from monolith useGNNStore for domain separation.
 */
import { create } from 'zustand';

const useConfigStore = create((set, get) => ({
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

  setTask: (task) => {
    set({
      selectedTask: task,
    });
  },
  setSelectedTask: (task) => get().setTask(task),
  setModel: (model) => set({ selectedModel: model }),
  setMockMode: (mode) => set({ mockMode: mode }),
  setHyperparams: (params) => set((s) => ({
    hyperparams: { ...s.hyperparams, ...params }
  })),

  /**
   * Build the full training config to send over WS.
   */
  buildTrainingConfig: () => {
    const s = get();
    return {
      task: s.selectedTask,
      model: s.selectedModel,
      dataset: s.mockMode ? 'cora' : 'custom',
      ...s.hyperparams,
    };
  },
}));

export default useConfigStore;
