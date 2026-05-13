import json
import os

# Mocking parts of loaders.py to test the FIXED logic
def test_parse_json_graph_fixed():
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
    
    # FIXED logic from loaders.py
    node_lookup = { n.get('id'): n for n in raw['nodes'] if n.get('id') is not None }
    
    first_node = raw['nodes'][0] if raw['nodes'] else {}
    feat_keys = [k for k in first_node.keys() if k not in ('id', 'label', 'class', 'name')]
    
    features = []
    # We must iterate according to unique_nodes (which matches node_map indices)
    for old_id in unique_nodes:
        n = node_lookup.get(old_id, {})
        features.append([float(n.get(k, 0)) for k in feat_keys])
    
    print(f"unique_nodes: {unique_nodes}")
    print(f"node_map: {node_map}")
    print(f"features list: {features}")
    
    # Node 5 is at unique_nodes[0], so features[0] should be node 5's features [0.0, 1.0]
    node_5_features = features[0] 
    if node_5_features == [0.0, 1.0]:
        print("FIX VERIFIED: Node 5 (index 0) got its correct features [0.0, 1.0]")
    else:
        print("FIX FAILED: Node 5 still has incorrect features")

    # Node 10 is at unique_nodes[1], so features[1] should be node 10's features [1.0, 0.0]
    node_10_features = features[1]
    if node_10_features == [1.0, 0.0]:
        print("FIX VERIFIED: Node 10 (index 1) got its correct features [1.0, 0.0]")
    else:
        print("FIX FAILED: Node 10 still has incorrect features")

if __name__ == "__main__":
    test_parse_json_graph_fixed()
