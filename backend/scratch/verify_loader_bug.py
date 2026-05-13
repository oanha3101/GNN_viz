import json
import os

# Mocking parts of loaders.py to test the logic without torch
def test_parse_json_graph_bug():
    raw = {
        "nodes": [
            {"id": 10, "feat1": 1.0, "feat2": 0.0},
            {"id": 5, "feat1": 0.0, "feat2": 1.0}
        ],
        "links": [
            {"source": 10, "target": 5}
        ]
    }
    
    # Logic from loaders.py
    sources = [10]
    targets = [5]
    
    unique_nodes = sorted(set(sources) | set(targets)) # [5, 10]
    node_map = {old: new for new, old in enumerate(unique_nodes)} # {5: 0, 10: 1}
    
    # Buggy logic from loaders.py
    first_node = raw['nodes'][0] if raw['nodes'] else {}
    feat_keys = [k for k in first_node.keys() if k not in ('id', 'label', 'class', 'name')]
    
    features = []
    for n in raw['nodes']:
        features.append([float(n.get(k, 0)) for k in feat_keys])
    
    print(f"unique_nodes: {unique_nodes}")
    print(f"node_map: {node_map}")
    print(f"features list: {features}")
    
    # In loaders.py, x is built from features list: x = torch.tensor(features)
    # So x[0] = features[0] = [1.0, 0.0]
    # But x[0] corresponds to unique_nodes[0] which is node 5.
    # Node 5 should have features [0.0, 1.0].
    
    node_5_features = features[0] 
    if node_5_features == [1.0, 0.0]:
        print("BUG CONFIRMED: Node 5 (index 0) got features of Node 10")
    else:
        print("BUG NOT PRESENT or logic changed")

if __name__ == "__main__":
    test_parse_json_graph_bug()
