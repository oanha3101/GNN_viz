import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.analytics_service import _compute_attention_head_diversity
from services import analytics_i18n, analytics_service


def test_attention_head_diversity_accepts_edge_keyed_dict():
    snapshot = {
        "attention_per_head": {
            "0-1": [0.9, 0.1, 0.0, 0.0],
            "1-2": [0.1, 0.8, 0.1, 0.0],
            "2-3": [0.0, 0.2, 0.7, 0.1],
        }
    }

    result = _compute_attention_head_diversity(snapshot)

    assert "diversity" in result
    assert "label" in result
    assert result["label"] in {"diverse", "moderate", "redundant"}


def test_attention_head_diversity_handles_invalid_shapes_gracefully():
    snapshot = {
        "attention_per_head": {
            "0-1": {"bad": "shape"},
            "1-2": None,
        }
    }

    result = _compute_attention_head_diversity(snapshot)

    assert result == {"diversity": 0, "label": "single_head"}


def test_generate_recommendations_merges_llm_brief(monkeypatch):
    monkeypatch.setattr(
        analytics_service.llm_analyst_service,
        "get_public_status",
        lambda: {"enabled": True, "provider": "deepseek", "model": "deepseek-chat"},
    )
    monkeypatch.setattr(
        analytics_service.llm_analyst_service,
        "generate_recommendation_brief",
        lambda **kwargs: {
            "summary": "LLM summary",
            "analyst_brief": {
                "findings": ["Weak-class recall is lagging."],
                "risks": ["Shortcut bias may be active."],
                "next_steps": ["Use Macro F1 to choose the best epoch."],
            },
            "source": "llm",
            "llm": {"enabled": True, "provider": "deepseek", "model": "deepseek-chat"},
        },
    )

    result = analytics_service.generate_recommendations(
        snapshots=[{"val_acc": 0.68, "train_acc": 0.72, "train_loss": 0.41, "macro_f1": 0.63}],
        model_type="GAT",
        config={"dataset": "PROTEINS"},
        graph_payload={},
    )

    assert result["source"] == "llm"
    assert result["summary"] == "LLM summary"
    assert result["analyst_brief"]["findings"] == ["Weak-class recall is lagging."]


def test_analyze_dataset_topology_accepts_compact_link_shapes():
    result = analytics_service.analyze_dataset_topology(
        {
            "graph_data_json": {
                "nodes": [{"id": 0, "groundTruth": 1}, {"id": 1, "groundTruth": 1}, {"id": 2, "groundTruth": 0}],
                "links": [[0, 1], [1, 2], {"source": 2, "target": 0}],
            }
        },
        snapshots=[{"majority_ratio": [0.8, 0.7, 0.9]}],
    )

    assert result["properties"]["n_nodes"] == 3
    assert result["properties"]["n_edges"] == 3
    assert result["properties"]["n_classes"] == 2
    assert result["properties"]["homophily_estimate"] == 0.8


def test_analyze_dataset_topology_accepts_graph_data_fallback():
    result = analytics_service.analyze_dataset_topology(
        {
            "graph_data": {
                "nodes": [{"id": 0, "groundTruth": 0}, {"id": 1, "groundTruth": 1}],
                "links": [{"source": 0, "target": 1}],
            }
        },
        snapshots=[{"majority_ratio": [0.4, 0.6]}],
    )

    assert result["properties"]["n_nodes"] == 2
    assert result["properties"]["n_edges"] == 1
    assert result["properties"]["n_classes"] == 2


def test_generate_research_notes_translation_uses_dataset_name_and_skips_empty_context(monkeypatch):
    monkeypatch.setattr(
        analytics_service.llm_analyst_service,
        "generate_research_notes",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        analytics_service.llm_analyst_service,
        "get_public_status",
        lambda: {"enabled": False, "provider": "mimo", "model": ""},
    )

    snapshots = [
        {"train_acc": 0.55, "val_acc": 0.60, "train_loss": 0.52},
        {"train_acc": 0.58, "val_acc": 0.63, "train_loss": 0.41},
        {"train_acc": 0.60, "val_acc": 0.67, "train_loss": 0.34},
        {"train_acc": 0.61, "val_acc": 0.70, "train_loss": 0.28},
        {"train_acc": 0.62, "val_acc": 0.72, "train_loss": 0.22},
    ]

    notes = analytics_service.generate_research_notes(
        snapshots=snapshots,
        model_type="GAT",
        config={"dataset_name": "cora"},
        graph_payload={"task_data_json": {"noop": True}},
    )
    translated = analytics_i18n.translate_research_notes(notes, "vi")

    summary = translated["sections"][0]["content"]
    observations = translated["sections"][1]["content"]
    titles = [section["title"] for section in translated["sections"]]

    assert "tập cora" in summary
    assert "unknown" not in summary.lower()
    assert "Overfitting assessment" not in observations
    assert "Đánh giá quá khớp" in observations
    assert "gap=0.0%" in observations
    assert "Bối cảnh tập dữ liệu" not in titles


def test_generate_comparison_insights_returns_winner_leaderboard_and_next_steps():
    results = [
        {
            "experiment": {
                "id": 101,
                "title": "GCN Stable",
                "model_type": "GCN",
                "accuracy": 0.88,
                "loss": 0.22,
                "best_epoch": 4,
            },
            "metrics": {"history": {"primary_score": [0.62, 0.74, 0.81, 0.86, 0.88, 0.88]}},
            "snapshots": [
                {"val_acc": 0.62, "train_acc": 0.66, "train_loss": 0.71, "dirichlet_energy": 1.0, "majority_ratio": [0.8, 0.75], "node_correctness": [True, True]},
                {"val_acc": 0.74, "train_acc": 0.76, "train_loss": 0.52, "dirichlet_energy": 0.8, "majority_ratio": [0.8, 0.75], "node_correctness": [True, True]},
                {"val_acc": 0.81, "train_acc": 0.82, "train_loss": 0.44, "dirichlet_energy": 0.65, "majority_ratio": [0.8, 0.75], "node_correctness": [True, True]},
                {"val_acc": 0.86, "train_acc": 0.86, "train_loss": 0.35, "dirichlet_energy": 0.55, "majority_ratio": [0.8, 0.75], "node_correctness": [True, True]},
                {"val_acc": 0.88, "train_acc": 0.88, "train_loss": 0.31, "dirichlet_energy": 0.5, "majority_ratio": [0.8, 0.75], "node_correctness": [True, True]},
                {"val_acc": 0.88, "train_acc": 0.89, "train_loss": 0.29, "dirichlet_energy": 0.48, "majority_ratio": [0.8, 0.75], "node_correctness": [True, True]},
            ],
        },
        {
            "experiment": {
                "id": 102,
                "title": "GAT Flashy",
                "model_type": "GAT",
                "accuracy": 0.9,
                "loss": 0.24,
                "best_epoch": 2,
            },
            "metrics": {"history": {"primary_score": [0.68, 0.85, 0.9, 0.82, 0.8, 0.79]}},
            "snapshots": [
                {"val_acc": 0.68, "train_acc": 0.73, "train_loss": 0.69, "dirichlet_energy": 1.0, "majority_ratio": [0.52, 0.58], "node_correctness": [True, False]},
                {"val_acc": 0.85, "train_acc": 0.91, "train_loss": 0.48, "dirichlet_energy": 0.7, "majority_ratio": [0.52, 0.58], "node_correctness": [True, False]},
                {"val_acc": 0.9, "train_acc": 0.96, "train_loss": 0.35, "dirichlet_energy": 0.45, "majority_ratio": [0.52, 0.58], "node_correctness": [True, False]},
                {"val_acc": 0.82, "train_acc": 0.97, "train_loss": 0.29, "dirichlet_energy": 0.22, "majority_ratio": [0.52, 0.58], "node_correctness": [True, False]},
                {"val_acc": 0.8, "train_acc": 0.98, "train_loss": 0.22, "dirichlet_energy": 0.12, "majority_ratio": [0.52, 0.58], "node_correctness": [True, False]},
                {"val_acc": 0.79, "train_acc": 0.99, "train_loss": 0.2, "dirichlet_energy": 0.08, "majority_ratio": [0.52, 0.58], "node_correctness": [True, False]},
            ],
        },
    ]

    payload = analytics_service.generate_comparison_insights(results, graph_payload=None, lang="en")

    assert payload["winner"]["label"] == "GCN Stable"
    assert payload["leaderboard"][0]["label"] == "GCN Stable"
    assert payload["leaderboard"][0]["composite_score"] > payload["leaderboard"][1]["composite_score"]
    assert payload["next_steps"]
    assert payload["insights"][0]["title"] == "Overall Recommendation"
