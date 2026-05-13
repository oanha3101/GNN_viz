import pandas as pd

from api.user_loader import MappingConfig, _validate_graph_tables


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
