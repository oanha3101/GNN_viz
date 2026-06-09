import pandas as pd

from api.task_adapters import GraphClassificationAdapter, NodeClassificationAdapter
from api.user_loader import MappingConfig, _parse_and_align, _validate_graph_tables


def base_mapping(**overrides):
    data = {
        'task': 5,
        'node_id': 'node_id',
        'edge_source': 'source',
        'edge_target': 'target',
        'node_features': [],
    }
    data.update(overrides)
    return MappingConfig(**data)


def test_upload_validation_rejects_duplicate_nodes_and_orphan_edges():
    nodes = pd.DataFrame({'node_id': [1, 1, 2], 'feature': [0.1, 0.2, 0.3]})
    edges = pd.DataFrame({'source': [1, 2], 'target': [2, 99]})

    errors, warnings = _validate_graph_tables(nodes, edges, None, base_mapping(node_features=['feature']))

    assert any('Duplicate node IDs' in err for err in errors)
    assert any('unknown node ID' in err for err in errors)
    assert warnings == []


def test_upload_validation_rejects_endpoint_type_mismatch():
    nodes = pd.DataFrame({'node_id': [1, 2, 3]})
    edges = pd.DataFrame({'source': ['1', '2'], 'target': ['2', '3']})

    errors, _ = _validate_graph_tables(nodes, edges, None, base_mapping())

    assert any('type does not match' in err for err in errors)


def test_upload_validation_warns_for_duplicate_edges_self_loops_and_sparse_features():
    nodes = pd.DataFrame({'node_id': ['a', 'b', 'c'], 'feature': [None, None, 3.0]})
    edges = pd.DataFrame({'source': ['a', 'a', 'b'], 'target': ['a', 'b', 'a']})

    errors, warnings = _validate_graph_tables(nodes, edges, None, base_mapping(node_features=['feature']))

    assert errors == []
    assert any('self-loop' in warning for warning in warnings)
    assert any('duplicate edge' in warning for warning in warnings)
    assert any('blank' in warning for warning in warnings)


def test_upload_validation_rejects_missing_graph_labels_for_graph_classification():
    nodes = pd.DataFrame({'node_id': [1, 2, 3], 'graph_id': ['g1', 'g2', 'g2']})
    edges = pd.DataFrame({'source': [1, 2], 'target': [2, 3]})
    graphs = pd.DataFrame({'graph_id': ['g1'], 'label': ['A']})
    mapping = base_mapping(task=2, graph_id='graph_id', graph_label='label')

    errors, _ = _validate_graph_tables(nodes, edges, graphs, mapping)

    assert any('missing graph_id label' in err for err in errors)


def test_graph_classification_upload_preserves_generic_label_metadata():
    nodes = pd.DataFrame({
        'node_id': [1, 2, 3, 4, 5, 6],
        'graph_id': ['mol-a', 'mol-a', 'mol-b', 'mol-b', 'mol-c', 'mol-c'],
        'atom_weight': [12.0, 16.0, 12.0, 1.0, 14.0, 16.0],
    })
    edges = pd.DataFrame({
        'source': [1, 3, 5],
        'target': [2, 4, 6],
    })
    graphs = pd.DataFrame({
        'graph_id': ['mol-a', 'mol-b', 'mol-c'],
        'label': ['toxic', 'benign', 'toxic'],
    })
    mapping = base_mapping(
        task=2,
        graph_id='graph_id',
        graph_label='label',
        node_features=['atom_weight'],
    )
    adapter = GraphClassificationAdapter()
    aligned_nodes, aligned_edges, node_mapper, num_nodes, _ = _parse_and_align(nodes, edges, graphs, mapping)

    result = adapter.process(aligned_nodes, aligned_edges, graphs, mapping, node_mapper, num_nodes)

    assert result['graph_json']['classNames'] == ['benign', 'toxic']
    assert result['graph_json']['labelMap'] == {'benign': 0, 'toxic': 1}
    assert result['graph_json']['groundTruth'] == [1, 0, 1]
    assert result['graph_json']['graphs'][0]['sourceGraphId'] == 'mol-a'
    assert getattr(result['pyg_data_list'][0], 'class_names') == ['benign', 'toxic']
    assert getattr(result['pyg_data_list'][0], 'label_map') == {'benign': 0, 'toxic': 1}


def test_node_classification_upload_uses_stratified_split_and_label_metadata():
    nodes = pd.DataFrame({
        'node_id': list(range(12)),
        'label': ['fraud'] * 6 + ['normal'] * 6,
        'amount': [float(i) for i in range(12)],
    })
    edges = pd.DataFrame({
        'source': list(range(11)),
        'target': list(range(1, 12)),
    })
    mapping = base_mapping(task=1, node_label='label', node_features=['amount'])
    adapter = NodeClassificationAdapter()
    aligned_nodes, aligned_edges, node_mapper, num_nodes, _ = _parse_and_align(nodes, edges, None, mapping)

    result = adapter.process(aligned_nodes, aligned_edges, None, mapping, node_mapper, num_nodes)

    assert result['graph_json']['classNames'] == ['fraud', 'normal']
    assert result['graph_json']['labelMap'] == {'fraud': 0, 'normal': 1}
    assert result['graph_json']['splitClassCounts']['train'] == [4, 4]
    assert result['graph_json']['splitClassCounts']['val'] == [1, 1]
    assert result['graph_json']['splitClassCounts']['test'] == [1, 1]
    assert result['pyg_data'].train_mask.sum().item() == 8
