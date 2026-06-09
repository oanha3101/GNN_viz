export function buildTask2TrainingDefaults(selectedTask, selectedModel) {
  if (selectedTask !== 2) return {}
  const model = (selectedModel || 'GCN').toUpperCase()
  if (model === 'GCN') {
    return {
      task2_pool: 'attention_sum',
      task2_class_weighting: true,
      task2_balanced_sampler: true,
      task2_focal_gamma: 1.5,
      task2_label_smoothing: 0.03,
      task2_weight_decay: 1e-3,
      task2_edge_dropout: 0.10,
      task2_readout_entropy_weight: 0.01,
      task2_density_contrastive_weight: 0.02,
    }
  }
  if (model === 'GAT') {
    return {
      task2_pool: 'attention_sum',
      task2_class_weighting: true,
      task2_balanced_sampler: true,
      task2_focal_gamma: 1.5,
      task2_label_smoothing: 0.02,
      task2_weight_decay: 1e-3,
      task2_edge_dropout: 0.20,
      task2_attn_dropout: 0.25,
      task2_readout_entropy_weight: 0.01,
      task2_density_contrastive_weight: 0.03,
    }
  }
  if (model === 'SAGE' || model === 'GRAPHSAGE' || model === 'GRAPH_SAGE') {
    return {
      task2_pool: 'attention_sum',
      task2_class_weighting: true,
      task2_balanced_sampler: true,
      task2_focal_gamma: 2.0,
      task2_label_smoothing: 0.02,
      task2_weight_decay: 1e-3,
      task2_edge_dropout: 0.15,
      task2_readout_entropy_weight: 0.01,
      task2_density_contrastive_weight: 0.02,
      task2_temperature_min: 1.0,
      task2_temperature_max: 1.5,
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

export function buildTaskTrainingDefaults(selectedTask, selectedModel) {
  if (selectedTask === 1) {
    const model = (selectedModel || 'GCN').toUpperCase()
    if (model === 'SAGE' || model === 'GRAPHSAGE' || model === 'GRAPH_SAGE') {
      return {
        task1_edge_dropout: 0.15,
        task1_selection_metric: '0.4*val_acc+0.6*boundary_accuracy',
      }
    }
  }
  return buildTask2TrainingDefaults(selectedTask, selectedModel)
}
