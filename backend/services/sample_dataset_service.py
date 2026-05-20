from __future__ import annotations

import io
import logging
from copy import deepcopy
from datetime import datetime
from collections import defaultdict
from typing import Any, Dict, List, Tuple

import torch

from data.loaders import DATA_DIR, auto_detect_graph, load_citeseer, load_cora, load_karate
from models.sql_models import Dataset, DatasetLifecycle, DatasetVersion
from services.hybrid_store import blob_store
from tasks.graph_classification import generate_synthetic_graphs

logger = logging.getLogger(__name__)


TASK_LABELS = {
    1: "Task 1 · Node Classification",
    2: "Task 2 · Graph Classification",
    3: "Task 3 · Link Prediction",
    4: "Task 4 · Community Detection",
    5: "Task 5 · Graph Embedding",
    6: "Task 6 · Graph Generation",
}


def _graph_json_from_single_graph(data) -> dict:
    edge_index = data.edge_index.cpu().numpy()
    num_nodes = int(data.num_nodes or data.x.size(0))
    degrees = [0] * num_nodes
    links = []
    for i in range(edge_index.shape[1]):
        src = int(edge_index[0, i])
        tgt = int(edge_index[1, i])
        if src < tgt:
            links.append({"source": src, "target": tgt})
        degrees[src] += 1

    labels = []
    if hasattr(data, "y") and data.y is not None:
        values = data.y.view(-1).cpu().tolist()
        if len(values) == num_nodes:
            labels = [int(v) for v in values]

    nodes = []
    train_mask = None
    val_mask = None
    test_mask = None
    if hasattr(data, "train_mask") and data.train_mask is not None:
        train_mask = [bool(v) for v in data.train_mask.view(-1).cpu().tolist()]
    if hasattr(data, "val_mask") and data.val_mask is not None:
        val_mask = [bool(v) for v in data.val_mask.view(-1).cpu().tolist()]
    if hasattr(data, "test_mask") and data.test_mask is not None:
        test_mask = [bool(v) for v in data.test_mask.view(-1).cpu().tolist()]
    for node_id in range(num_nodes):
        nodes.append(
            {
                "id": node_id,
                "degree": int(degrees[node_id]),
                "groundTruth": labels[node_id] if labels else 0,
                "inTrainSet": train_mask[node_id] if train_mask else True,
            }
        )

    payload = {
        "graphData": {"nodes": nodes, "links": links},
        "groundTruth": labels,
        "classNames": [f"C{i}" for i in sorted(set(labels))] if labels else [],
    }
    if train_mask is not None:
        payload["trainMask"] = train_mask
    if val_mask is not None:
        payload["valMask"] = val_mask
    if test_mask is not None:
        payload["testMask"] = test_mask
    return payload


def _graph_json_from_graph_list(graphs: List[Any]) -> dict:
    payload_graphs = []
    ground_truth = []

    for graph_index, graph in enumerate(graphs):
        edge_index = graph.edge_index.cpu().numpy()
        num_nodes = int(graph.num_nodes or graph.x.size(0))
        links = []
        for i in range(edge_index.shape[1]):
            src = int(edge_index[0, i])
            tgt = int(edge_index[1, i])
            if src < tgt:
                links.append({"source": src, "target": tgt})

        label = 0
        if hasattr(graph, "y") and graph.y is not None:
            label = int(graph.y.view(-1)[0].item())

        ground_truth.append(label)
        payload_graphs.append(
            {
                "id": graph_index,
                "groundTruth": label,
                "nodes": [{"id": node_id} for node_id in range(num_nodes)],
                "links": links,
                "numNodes": num_nodes,
                "numEdges": len(links),
            }
        )

    return {
        "graphs": payload_graphs,
        "groundTruth": ground_truth,
        "classNames": [f"C{i}" for i in sorted(set(ground_truth))] if ground_truth else [],
    }


def _save_artifact(blob_key: str, payload: Any, graph_json: dict) -> str:
    buffer = io.BytesIO()
    torch.save(payload, buffer)
    blob_store.put_bytes(blob_key, buffer.getvalue())
    blob_store.put_json(f"{blob_key}.json", graph_json)
    return blob_key


def _single_graph_metadata(data, *, task_id: int, source_name: str, sample_key: str, note: str, task_config: Dict[str, Any] | None = None):
    prepared, meta = auto_detect_graph(deepcopy(data))
    num_classes = int(meta.get("num_classes") or 0)
    return prepared, {
        "task_profile_id": task_id,
        "task_profile_name": TASK_LABELS[task_id].split("·", 1)[1].strip(),
        "task_profile_config": task_config or {},
        "num_nodes": int(meta.get("num_nodes") or 0),
        "num_edges": int(meta.get("num_edges") or 0),
        "num_features": int(meta.get("feature_dim") or 0),
        "num_classes": num_classes,
        "num_graphs": 1,
        "sample_catalog": {
            "sample_key": sample_key,
            "source_name": source_name,
            "recommended_task_ids": [task_id],
            "recommended_task_label": TASK_LABELS[task_id],
            "note": note,
            "is_starter_sample": True,
        },
    }


def _load_mutag_subset(limit: int = 120) -> Tuple[List[Any], str]:
    try:
        from torch_geometric.datasets import TUDataset

        dataset = TUDataset(root=DATA_DIR, name="MUTAG")
        graphs = _select_graph_subset(dataset, limit=limit, seed=42, balance_classes=False)
        return graphs, "MUTAG"
    except Exception as exc:
        logger.warning("[Samples] MUTAG unavailable, falling back to synthetic graph collection: %s", exc)
        synthetic = [item["pyg"] for item in generate_synthetic_graphs(num_graphs=60)]
        return synthetic, "Synthetic graph collection"


def _load_proteins_subset(limit: int = 180) -> Tuple[List[Any], str]:
    try:
        from torch_geometric.datasets import TUDataset

        dataset = TUDataset(root=DATA_DIR, name="PROTEINS")
        graphs = _select_graph_subset(dataset, limit=limit, seed=42, balance_classes=True)
        return graphs, "PROTEINS"
    except Exception as exc:
        logger.warning("[Samples] PROTEINS unavailable, falling back to MUTAG subset: %s", exc)
        graphs, source = _load_mutag_subset(limit=min(limit, 120))
        return graphs, f"{source} fallback"


def _select_graph_subset(dataset, *, limit: int, seed: int = 42, balance_classes: bool = False) -> List[Any]:
    total = len(dataset)
    if total <= limit:
        return [dataset[i] for i in range(total)]

    label_to_indices = defaultdict(list)
    for index in range(total):
        graph = dataset[index]
        label = int(graph.y.view(-1)[0].item()) if hasattr(graph, "y") and graph.y is not None else 0
        label_to_indices[label].append(index)

    rng = torch.Generator().manual_seed(seed)
    ordered_labels = sorted(label_to_indices.keys())

    if balance_classes and ordered_labels:
        per_class = max(1, limit // len(ordered_labels))
        selected = []
        leftovers = []
        for label in ordered_labels:
            indices = label_to_indices[label]
            perm = torch.randperm(len(indices), generator=rng).tolist()
            shuffled = [indices[i] for i in perm]
            take = min(per_class, len(shuffled))
            selected.extend(shuffled[:take])
            leftovers.extend(shuffled[take:])
        remaining = max(0, limit - len(selected))
        if remaining > 0 and leftovers:
            perm = torch.randperm(len(leftovers), generator=rng).tolist()
            selected.extend([leftovers[i] for i in perm[:remaining]])
    else:
        selected = []
        remainders = []
        for label in ordered_labels:
            indices = label_to_indices[label]
            perm = torch.randperm(len(indices), generator=rng).tolist()
            shuffled = [indices[i] for i in perm]
            share = max(1, round(limit * len(shuffled) / total))
            selected.extend(shuffled[:share])
            remainders.extend(shuffled[share:])
        if len(selected) > limit:
            selected = selected[:limit]
        elif len(selected) < limit and remainders:
            perm = torch.randperm(len(remainders), generator=rng).tolist()
            selected.extend([remainders[i] for i in perm[: limit - len(selected)]])

    selected = selected[:limit]
    return [dataset[i] for i in selected]


def _graph_collection_metadata(graphs: List[Any], *, task_id: int, source_name: str, sample_key: str, note: str):
    labels = []
    feature_dims = []
    total_nodes = 0
    total_edges = 0

    for graph in graphs:
        total_nodes += int(graph.num_nodes or graph.x.size(0))
        total_edges += int(graph.edge_index.size(1) // 2)
        if hasattr(graph, "x") and graph.x is not None:
            feature_dims.append(int(graph.x.size(1)))
        if hasattr(graph, "y") and graph.y is not None:
            labels.append(int(graph.y.view(-1)[0].item()))

    return {
        "task_profile_id": task_id,
        "task_profile_name": TASK_LABELS[task_id].split("·", 1)[1].strip(),
        "task_profile_config": {},
        "num_nodes": total_nodes,
        "num_edges": total_edges,
        "num_features": max(feature_dims) if feature_dims else 1,
        "num_classes": len(set(labels)),
        "num_graphs": len(graphs),
        "sample_catalog": {
            "sample_key": sample_key,
            "source_name": source_name,
            "recommended_task_ids": [task_id],
            "recommended_task_label": TASK_LABELS[task_id],
            "note": note,
            "is_starter_sample": True,
        },
    }


def _sample_specs() -> List[Dict[str, Any]]:
    cora = load_cora()
    citeseer = load_citeseer()
    karate = load_karate()
    mutag_graphs, mutag_source = _load_mutag_subset()
    proteins_graphs, proteins_source = _load_proteins_subset()

    cora_nc, cora_nc_meta = _single_graph_metadata(
        cora,
        task_id=1,
        source_name="Cora",
        sample_key="sample-cora-node-classification",
        note="Citation network starter for node labels and class-boundary visualization.",
    )
    karate_nc, karate_nc_meta = _single_graph_metadata(
        karate,
        task_id=1,
        source_name="Karate Club",
        sample_key="sample-karate-node-classification-showcase",
        note="Compact node-classification showcase for low-lag topology playback, neighborhood inspection, and model comparison.",
    )
    citeseer_lp, citeseer_lp_meta = _single_graph_metadata(
        citeseer,
        task_id=3,
        source_name="CiteSeer",
        sample_key="sample-citeseer-link-prediction",
        note="Single citation graph starter for missing-edge recovery and link scoring.",
        task_config={"edge_split_ratio": 0.15},
    )
    karate_cd, karate_cd_meta = _single_graph_metadata(
        karate,
        task_id=4,
        source_name="Karate Club",
        sample_key="sample-karate-community-detection",
        note="Small social graph starter for community structure and unsupervised partition checks.",
        task_config={"num_communities": 4, "has_community_gt": True},
    )
    cora_embed, cora_embed_meta = _single_graph_metadata(
        cora,
        task_id=5,
        source_name="Cora",
        sample_key="sample-cora-graph-embedding",
        note="Embedding starter for latent space inspection and neighborhood structure.",
    )
    karate_gen, karate_gen_meta = _single_graph_metadata(
        karate,
        task_id=6,
        source_name="Karate Club",
        sample_key="sample-karate-graph-generation",
        note="Compact reference graph for structure-aware generation and replay.",
        task_config={"reference_density": 0.139, "reference_avg_degree": 4.6},
    )
    mutag_meta = _graph_collection_metadata(
        mutag_graphs,
        task_id=2,
        source_name=mutag_source,
        sample_key="sample-mutag-graph-classification",
        note="Starter collection of labeled graphs for whole-graph classification and pooled readout analysis.",
    )
    proteins_meta = _graph_collection_metadata(
        proteins_graphs,
        task_id=2,
        source_name=proteins_source,
        sample_key="sample-proteins-graph-classification",
        note="Broader protein graph benchmark for robustness checks, class-balance experiments, and pooled readout comparisons beyond MUTAG.",
    )

    return [
        {
            "slug": "sample-cora-node-classification",
            "name": "Sample · Cora Node Classification",
            "description": "Starter sample for Task 1 using the Cora citation graph. Best for node-level label prediction with GCN, GAT, or GraphSAGE.",
            "graph_payload": cora_nc,
            "graph_json": _graph_json_from_single_graph(cora_nc),
            "summary_json": cora_nc_meta,
            "blob_key": "datasets/samples/cora-node-classification.pt",
        },
        {
            "slug": "sample-karate-node-classification-showcase",
            "name": "Sample · Karate Node Classification Showcase",
            "description": "Compact starter sample for Task 1 using Karate Club. Best for beautiful low-lag topology playback, node inspection, and GCN/GAT/GraphSAGE comparisons.",
            "graph_payload": karate_nc,
            "graph_json": _graph_json_from_single_graph(karate_nc),
            "summary_json": karate_nc_meta,
            "blob_key": "datasets/samples/karate-node-classification-showcase.pt",
        },
        {
            "slug": "sample-mutag-graph-classification",
            "name": f"Sample · {mutag_source} Graph Classification",
            "description": f"Starter sample for Task 2 using {mutag_source}. Best for graph-level labels, pooled readout, and dataset-wide evaluation.",
            "graph_payload": mutag_graphs,
            "graph_json": _graph_json_from_graph_list(mutag_graphs),
            "summary_json": mutag_meta,
            "blob_key": "datasets/samples/mutag-graph-classification.pt",
        },
        {
            "slug": "sample-proteins-graph-classification",
            "name": f"Sample · {proteins_source} Graph Classification",
            "description": f"Expanded Task 2 benchmark using {proteins_source}. Best for robustness checks, class-balance work, and graph-level generalization beyond small motif collections.",
            "graph_payload": proteins_graphs,
            "graph_json": _graph_json_from_graph_list(proteins_graphs),
            "summary_json": proteins_meta,
            "blob_key": "datasets/samples/proteins-graph-classification.pt",
        },
        {
            "slug": "sample-citeseer-link-prediction",
            "name": "Sample · CiteSeer Link Prediction",
            "description": "Starter sample for Task 3 using the CiteSeer citation graph. Best for edge recovery, ranking, and structural scoring.",
            "graph_payload": citeseer_lp,
            "graph_json": _graph_json_from_single_graph(citeseer_lp),
            "summary_json": citeseer_lp_meta,
            "blob_key": "datasets/samples/citeseer-link-prediction.pt",
        },
        {
            "slug": "sample-karate-community-detection",
            "name": "Sample · Karate Community Detection",
            "description": "Starter sample for Task 4 using Karate Club. Best for community separation, cluster inspection, and modularity-style behavior.",
            "graph_payload": karate_cd,
            "graph_json": _graph_json_from_single_graph(karate_cd),
            "summary_json": karate_cd_meta,
            "blob_key": "datasets/samples/karate-community-detection.pt",
        },
        {
            "slug": "sample-cora-graph-embedding",
            "name": "Sample · Cora Graph Embedding",
            "description": "Starter sample for Task 5 using Cora. Best for latent space exploration, node neighborhood similarity, and embedding drift checks.",
            "graph_payload": cora_embed,
            "graph_json": _graph_json_from_single_graph(cora_embed),
            "summary_json": cora_embed_meta,
            "blob_key": "datasets/samples/cora-graph-embedding.pt",
        },
        {
            "slug": "sample-karate-graph-generation",
            "name": "Sample · Karate Graph Generation",
            "description": "Starter sample for Task 6 using Karate Club as a compact reference graph. Best for generation previews without a huge runtime cost.",
            "graph_payload": karate_gen,
            "graph_json": _graph_json_from_single_graph(karate_gen),
            "summary_json": karate_gen_meta,
            "blob_key": "datasets/samples/karate-graph-generation.pt",
        },
    ]


def ensure_sample_datasets(db) -> None:
    specs = _sample_specs()

    for spec in specs:
        dataset = db.query(Dataset).filter(Dataset.slug == spec["slug"]).first()
        if not dataset:
            dataset = Dataset(
                name=spec["name"],
                slug=spec["slug"],
                description=spec["description"],
                owner_id=None,
                is_public=True,
            )
            db.add(dataset)
            db.flush()
        else:
            dataset.name = spec["name"]
            dataset.description = spec["description"]
            dataset.is_public = True

        version = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset.id, DatasetVersion.version == 1)
            .first()
        )

        _save_artifact(spec["blob_key"], spec["graph_payload"], spec["graph_json"])
        blob_store.put_json(f"{spec['blob_key']}.json", spec["graph_json"])

        published_at = datetime.utcnow()
        if not version:
            version = DatasetVersion(
                dataset_id=dataset.id,
                version=1,
                lifecycle=DatasetLifecycle.PUBLISHED.value,
                schema_version="2.0",
                summary_json=spec["summary_json"],
                validation_json={"source": "system_seed", "valid": True},
                processed_blob_key=spec["blob_key"],
                created_by=None,
                published_by=None,
                published_at=published_at,
            )
            db.add(version)
            db.flush()
        else:
            version.lifecycle = DatasetLifecycle.PUBLISHED.value
            version.summary_json = spec["summary_json"]
            version.validation_json = {"source": "system_seed", "valid": True}
            version.processed_blob_key = spec["blob_key"]
            version.published_at = version.published_at or published_at

        if dataset.current_version_id != version.id:
            dataset.current_version_id = version.id

    db.commit()
