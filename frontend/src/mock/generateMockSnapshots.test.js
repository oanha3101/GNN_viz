import { describe, expect, it } from 'vitest'
import { generateTask1Mock, generateTask2Mock, generateTask3Mock, generateTask4Mock } from './generateMockSnapshots'

describe('generateTask1Mock', () => {
  it('emits model-specific Task 1 payloads from the same seed inputs', () => {
    const gcn = generateTask1Mock(24, 12, 'GCN')
    const gat = generateTask1Mock(24, 12, 'GAT')
    const sage = generateTask1Mock(24, 12, 'SAGE')

    expect(gcn.snapshots[0].model_type).toBe('GCN')
    expect(gat.snapshots[0].model_type).toBe('GAT')
    expect(sage.snapshots[0].model_type).toBe('SAGE')

    expect(gat.snapshots[4].attention_edges?.length).toBeGreaterThan(0)
    expect(Object.keys(gat.snapshots[4].attention_per_head || {}).length).toBeGreaterThan(0)
    expect(gcn.snapshots[4].attention_edges).toBeNull()

    expect(sage.snapshots[4].sampling_edges?.length).toBeGreaterThan(0)
    expect(sage.snapshots[4].sampled_neighbors).toBeTruthy()
    expect(gcn.snapshots[4].sampling_edges).toBeNull()

    const gcnVal = gcn.snapshots.map((snap) => snap.val_acc.toFixed(4))
    const gatVal = gat.snapshots.map((snap) => snap.val_acc.toFixed(4))
    const sageVal = sage.snapshots.map((snap) => snap.val_acc.toFixed(4))
    expect(gatVal).not.toEqual(gcnVal)
    expect(sageVal).not.toEqual(gcnVal)
  })

  it('marks best-so-far epochs and boundary diagnostics', () => {
    const result = generateTask1Mock(20, 10, 'SAGE')
    const bestSnapshots = result.snapshots.filter((snap) => snap.is_best_so_far)

    expect(bestSnapshots.length).toBeGreaterThan(0)
    expect(result.snapshots[0]).toEqual(expect.objectContaining({
      boundary_accuracy: expect.any(Number),
      boundary_count: expect.any(Number),
      interior_accuracy: expect.any(Number),
      interior_boundary_gap: expect.any(Number),
      best_selection_metric: '0.4*val_acc+0.6*boundary_accuracy',
    }))
  })
})

describe('generateTask2Mock', () => {
  it('emits model-specific Task 2 graph-classification signatures', () => {
    const gcn = generateTask2Mock(20, 10, 'GCN')
    const gat = generateTask2Mock(20, 10, 'GAT')
    const sage = generateTask2Mock(20, 10, 'GraphSAGE')

    expect(gcn.snapshots[0]).toEqual(expect.objectContaining({
      model_type: 'GCN',
      epochs_target: 10,
      epochs_completed: 1,
      early_stopped: false,
      stop_reason: null,
    }))
    expect(gat.snapshots[0].model_type).toBe('GAT')
    expect(sage.snapshots[0].model_type).toBe('SAGE')

    const topk = (snap) => snap.node_contributions
      .map((arr) => [...arr].sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0))
      .reduce((sum, value) => sum + value, 0) / snap.node_contributions.length
    const flipCount = (snapA, snapB) => snapB.graph_predictions.filter((pred, index) => pred !== snapA.graph_predictions[index]).length

    expect(topk(gat.snapshots[7])).toBeGreaterThan(topk(gcn.snapshots[7]))
    expect(flipCount(sage.snapshots[0], sage.snapshots[1])).toBeGreaterThan(flipCount(sage.snapshots[8], sage.snapshots[9]))
    expect(gat.snapshots[7].attention_entropy.reduce((sum, value) => sum + value, 0))
      .toBeLessThan(gcn.snapshots[7].attention_entropy.reduce((sum, value) => sum + value, 0))
  })
})

describe('generateTask3Mock', () => {
  it('emits Task 3 epoch metadata and model-specific link diagnostics', () => {
    const gcn = generateTask3Mock(24, 8, 'GCN')
    const gat = generateTask3Mock(24, 8, 'GAT')
    const sage = generateTask3Mock(24, 8, 'GraphSAGE')

    expect(gcn.snapshots[0]).toEqual(expect.objectContaining({
      epochs_target: 8,
      epochs_completed: 1,
      model_type: 'GCN',
      early_stopped: false,
      stop_reason: null,
      edge_split_ratio: 0.15,
    }))
    expect(gcn.snapshots[0].edge_classifications?.length).toBe(gcn.testEdges.length)
    expect(gcn.snapshots[0].edge_structure_features?.length).toBe(gcn.testEdges.length)
    expect(gcn.snapshots[0].dirichlet_energy).toEqual(expect.any(Number))
    expect(gcn.snapshots[0].edge_similarity?.length).toBe(gcn.testEdges.length)
    expect(gcn.snapshots[0].attention_edges).toBeNull()

    expect(gat.snapshots[0].model_type).toBe('GAT')
    expect(gat.snapshots[0].attention_edges?.length).toBeGreaterThan(0)
    expect(Object.keys(gat.snapshots[0].attention_per_head || {}).length).toBeGreaterThan(0)
    expect(gat.snapshots[0].attention_focus_score).toEqual(expect.any(Number))

    expect(sage.snapshots[0].model_type).toBe('SAGE')
    expect(sage.snapshots[0].score_variance_by_edge?.length).toBe(sage.testEdges.length)
    expect(sage.snapshots[0].unstable_edge_indices?.length).toBeGreaterThan(0)
    expect(sage.snapshots[0].score_stability).toEqual(expect.any(Number))
    expect(sage.snapshots[0].sampling_edges).toBeUndefined()
  })
})

describe('generateTask4Mock', () => {
  it('emits Task 4 epoch metadata and model-specific visualization fields', () => {
    const gcn = generateTask4Mock(3, 6, 8, 'GCN')
    const gat = generateTask4Mock(3, 6, 8, 'GAT')
    const sage = generateTask4Mock(3, 6, 8, 'GraphSAGE')

    expect(gcn.snapshots[0]).toEqual(expect.objectContaining({
      epochs_target: 8,
      epochs_completed: 1,
      model_type: 'GCN',
      num_communities: 3,
      early_stopped: false,
      stop_reason: null,
      training_phase: 'baseline',
      baseline_similarity: expect.any(Number),
      visualization_confidence: expect.any(Number),
      initial_visual_noise: expect.any(Number),
    }))
    expect(gcn.snapshots[0].dirichlet_energy).toEqual(expect.any(Number))
    expect(gcn.snapshots[0].local_smoothness?.length).toBe(18)
    expect(gcn.snapshots[0].loss_components).toEqual(expect.objectContaining({
      pos_loss: expect.any(Number),
      neg_loss: expect.any(Number),
      cohesion_loss: expect.any(Number),
      balance_penalty: expect.any(Number),
      total_loss: expect.any(Number),
    }))
    expect(gcn.snapshots[0].normalized_loss).toEqual(expect.any(Number))
    expect(gcn.snapshots[0].val_reconstruction_auc).toEqual(expect.any(Number))
    expect(gcn.snapshots[0].generalization_gap).toEqual(expect.any(Number))
    expect(gcn.snapshots[0].community_balance).toEqual(expect.any(Number))
    expect(gcn.snapshots[0].collapse_risk).toEqual(expect.any(Boolean))
    expect(gcn.snapshots[0].oversmoothing_score).toEqual(expect.any(Number))
    expect(gcn.snapshots[0].smoothness_status).toEqual(expect.any(String))
    expect(gcn.snapshots[0].attention_edges).toBeNull()

    expect(gat.snapshots[0].model_type).toBe('GAT')
    expect(gat.snapshots[0].attention_edges?.length).toBeGreaterThan(0)
    expect(Object.keys(gat.snapshots[0].attention_per_head || {}).length).toBeGreaterThan(0)
    expect(gat.snapshots[0].attention_entropy).toEqual(expect.any(Number))
    expect(gat.snapshots[0].attention_focus_score).toEqual(expect.any(Number))

    expect(sage.snapshots[0].model_type).toBe('SAGE')
    expect(sage.snapshots[0].sage_robustness).toEqual(expect.any(Number))
    expect(sage.snapshots[0].sage_stability_score).toEqual(expect.any(Number))
    expect(sage.snapshots[0].sage_migration_rate).toEqual(expect.any(Number))
    expect(sage.snapshots[0].sage_noise_migrations?.length).toBe(18)
    expect(sage.snapshots[0].sampling_edges).toBeUndefined()
  })
})
