import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.analytics_service import _compute_attention_head_diversity
from services import analytics_service


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
