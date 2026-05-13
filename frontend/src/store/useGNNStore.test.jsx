import { beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'gnn_workspace_context'

async function loadStore() {
  vi.resetModules()
  const module = await import('./useGNNStore')
  return module.default
}

describe('useGNNStore workspace persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('hydrates workspace context from localStorage on boot', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedTask: 3,
      selectedModel: 'GAT',
      mockMode: false,
      hyperparams: { epochs: 40, lr: 0.001, hidden: 32, dropout: 0.3, heads: 2, aggregator: 'max' },
      activeProjectId: 12,
      activeProjectName: 'Recovered Project',
      activeDatasetId: 99,
      activeDatasetVersionId: 101,
      activeDatasetVersionName: 'Recovered Dataset v2',
      uploadedFilePath: 'datasets/raw/recovered.pt',
      datasetName: 'Recovered Dataset',
      uploadMetadata: { num_nodes: 8 },
      taskConfig: { edge_split_ratio: 0.2 },
    }))

    const store = await loadStore()
    const state = store.getState()

    expect(state.selectedTask).toBe(3)
    expect(state.selectedModel).toBe('GAT')
    expect(state.mockMode).toBe(false)
    expect(state.hyperparams.epochs).toBe(40)
    expect(state.activeProjectId).toBe(12)
    expect(state.activeDatasetVersionId).toBe(101)
    expect(state.uploadedFilePath).toBe('datasets/raw/recovered.pt')
    expect(state.datasetName).toBe('Recovered Dataset')
    expect(state.taskConfig).toEqual({ edge_split_ratio: 0.2 })
  })

  it('persists workspace updates when project and dataset context changes', async () => {
    const store = await loadStore()

    store.getState().setActiveProjectContext(7, 'Project Seven')
    store.getState().setActiveDatasetContext(8, 9, 'Dataset v9')
    store.getState().setUploadedFilePath('datasets/runtime/nodes.pt')
    store.getState().setDatasetName('Nodes Dataset')
    store.getState().setHyperparams({ epochs: 20 })

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toMatchObject({
      activeProjectId: 7,
      activeProjectName: 'Project Seven',
      activeDatasetId: 8,
      activeDatasetVersionId: 9,
      activeDatasetVersionName: 'Dataset v9',
      uploadedFilePath: 'datasets/runtime/nodes.pt',
      datasetName: 'Nodes Dataset',
      hyperparams: expect.objectContaining({ epochs: 20 }),
    })
  })
})
