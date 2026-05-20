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
      task2FocusMode: 'failures',
      task2GallerySort: 'entropy_desc',
      task2ClassFilter: 1,
      task2EmbeddingColorMode: 'confidence',
      task2SelectedCell: { pred: 1, gt: 0 },
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
    expect(state.task2FocusMode).toBe('failures')
    expect(state.task2GallerySort).toBe('entropy_desc')
    expect(state.task2ClassFilter).toBe(1)
    expect(state.task2EmbeddingColorMode).toBe('confidence')
    expect(state.task2SelectedCell).toEqual({ pred: 1, gt: 0 })
  })

  it('persists workspace updates when project and dataset context changes', async () => {
    const store = await loadStore()

    store.getState().setActiveProjectContext(7, 'Project Seven')
    store.getState().setActiveDatasetContext(8, 9, 'Dataset v9')
    store.getState().setUploadedFilePath('datasets/runtime/nodes.pt')
    store.getState().setDatasetName('Nodes Dataset')
    store.getState().setHyperparams({ epochs: 20 })
    store.getState().setTask2FocusMode('diffuse')
    store.getState().setTask2GallerySort('size_desc')
    store.getState().setTask2ClassFilter(2)
    store.getState().setTask2EmbeddingColorMode('entropy')
    store.getState().setTask2SelectedCell({ pred: 0, gt: 1 })

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toMatchObject({
      activeProjectId: 7,
      activeProjectName: 'Project Seven',
      activeDatasetId: 8,
      activeDatasetVersionId: 9,
      activeDatasetVersionName: 'Dataset v9',
      uploadedFilePath: 'datasets/runtime/nodes.pt',
      datasetName: 'Nodes Dataset',
      task2FocusMode: 'diffuse',
      task2GallerySort: 'size_desc',
      task2ClassFilter: 2,
      task2EmbeddingColorMode: 'entropy',
      task2SelectedCell: { pred: 0, gt: 1 },
      hyperparams: expect.objectContaining({ epochs: 20 }),
    })
  })

  it('resets task 2 shared analysis state when task or model changes', async () => {
    const store = await loadStore()

    store.getState().setTask2FocusMode('diffuse')
    store.getState().setTask2GallerySort('size_desc')
    store.getState().setTask2ClassFilter(1)
    store.getState().setTask2EmbeddingColorMode('entropy')
    store.getState().setTask2SelectedCell({ pred: 1, gt: 0 })

    store.getState().setTask(2)
    expect(store.getState().task2FocusMode).toBe('all')
    expect(store.getState().task2GallerySort).toBe('priority')
    expect(store.getState().task2ClassFilter).toBe('all')
    expect(store.getState().task2EmbeddingColorMode).toBe('predicted')
    expect(store.getState().task2SelectedCell).toBeNull()

    store.getState().setTask2FocusMode('diffuse')
    store.getState().setTask2GallerySort('size_desc')
    store.getState().setTask2ClassFilter(1)
    store.getState().setTask2EmbeddingColorMode('entropy')
    store.getState().setTask2SelectedCell({ pred: 1, gt: 0 })
    store.getState().setModel('GAT')

    expect(store.getState().task2FocusMode).toBe('all')
    expect(store.getState().task2GallerySort).toBe('priority')
    expect(store.getState().task2ClassFilter).toBe('all')
    expect(store.getState().task2EmbeddingColorMode).toBe('predicted')
    expect(store.getState().task2SelectedCell).toBeNull()
  })
})
