function buildTask2Profile(uploadMetadata = null) {
  const numGraphs = Number(uploadMetadata?.num_graphs ?? 0)
  const numClasses = Number(uploadMetadata?.num_classes ?? 0)
  const smallCollection = numGraphs > 0 && numGraphs < 80
  const mediumCollection = numGraphs >= 80 && numGraphs < 240
  const manyClasses = numClasses >= 4

  return {
    smallCollection,
    mediumCollection,
    manyClasses,
  }
}

export function buildTask2TrainingDefaults(selectedTask, selectedModel, uploadMetadata = null) {
  if (selectedTask !== 2) return {}
  const model = (selectedModel || 'GCN').toUpperCase()
  const profile = buildTask2Profile(uploadMetadata)
  if (model === 'GCN') {
    return {
      task2_pool: 'attention_sum',
      task2_class_weighting: true,
      task2_balanced_sampler: true,
      task2_focal_gamma: profile.smallCollection ? 1.0 : profile.mediumCollection ? 1.25 : 1.5,
      task2_label_smoothing: profile.smallCollection ? 0.01 : profile.mediumCollection ? 0.02 : 0.03,
      task2_weight_decay: profile.smallCollection ? 7e-4 : 1e-3,
      task2_edge_dropout: profile.smallCollection ? 0.04 : profile.mediumCollection ? 0.07 : 0.10,
      task2_readout_entropy_weight: profile.smallCollection ? 0.004 : profile.mediumCollection ? 0.007 : 0.01,
      task2_density_contrastive_weight: profile.smallCollection ? 0.008 : profile.mediumCollection ? 0.015 : 0.02,
    }
  }
  if (model === 'GAT') {
    return {
      task2_pool: 'attention_sum',
      task2_class_weighting: true,
      task2_balanced_sampler: true,
      task2_focal_gamma: profile.smallCollection ? 1.0 : profile.mediumCollection ? 1.25 : 1.5,
      task2_label_smoothing: profile.smallCollection ? 0.01 : 0.02,
      task2_weight_decay: 1e-3,
      task2_edge_dropout: profile.smallCollection ? 0.12 : profile.mediumCollection ? 0.16 : 0.20,
      task2_attn_dropout: profile.smallCollection ? 0.15 : profile.mediumCollection ? 0.20 : 0.25,
      task2_readout_entropy_weight: profile.smallCollection ? 0.004 : profile.mediumCollection ? 0.006 : 0.01,
      task2_density_contrastive_weight: profile.smallCollection ? 0.012 : profile.mediumCollection ? 0.02 : 0.03,
    }
  }
  if (model === 'SAGE' || model === 'GRAPHSAGE' || model === 'GRAPH_SAGE') {
    return {
      task2_pool: 'attention_sum',
      task2_class_weighting: true,
      task2_balanced_sampler: true,
      task2_focal_gamma: profile.smallCollection ? (profile.manyClasses ? 1.5 : 1.25) : profile.mediumCollection ? 1.5 : 2.0,
      task2_label_smoothing: profile.smallCollection ? 0.01 : profile.mediumCollection ? 0.015 : 0.02,
      task2_weight_decay: 1e-3,
      task2_edge_dropout: profile.smallCollection ? 0.08 : profile.mediumCollection ? 0.10 : 0.15,
      task2_readout_entropy_weight: profile.smallCollection ? 0.004 : profile.mediumCollection ? 0.006 : 0.01,
      task2_density_contrastive_weight: profile.smallCollection ? 0.008 : profile.mediumCollection ? 0.012 : 0.02,
      task2_temperature_min: profile.smallCollection ? 0.9 : 1.0,
      task2_temperature_max: profile.smallCollection ? 2.0 : profile.mediumCollection ? 1.8 : 1.5,
    }
  }
  return {
    task2_pool: 'attention_sum',
    task2_class_weighting: false,
    task2_balanced_sampler: true,
    task2_focal_gamma: 1.0,
    task2_label_smoothing: 0.02,
    task2_weight_decay: 1e-3,
    task2_edge_dropout: 0.08,
    task2_readout_entropy_weight: 0.02,
    task2_density_contrastive_weight: 0.025,
  }
}

export function buildTaskTrainingDefaults(selectedTask, selectedModel, uploadMetadata = null) {
  if (selectedTask === 1) {
    const model = (selectedModel || 'GCN').toUpperCase()
    if (model === 'SAGE' || model === 'GRAPHSAGE' || model === 'GRAPH_SAGE') {
      return {
        task1_edge_dropout: 0.15,
        task1_selection_metric: '0.4*val_acc+0.6*boundary_accuracy',
      }
    }
  }
  return buildTask2TrainingDefaults(selectedTask, selectedModel, uploadMetadata)
}
