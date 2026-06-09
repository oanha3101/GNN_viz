import sys
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services import llm_analyst_service


def test_extract_json_object_repairs_missing_field_commas():
    content = """
    {
      "summary": "ok"
      "findings": ["a"]
      "risks": []
      "next_steps": []
    }
    """

    parsed = llm_analyst_service._extract_json_object(content)

    assert parsed["summary"] == "ok"
    assert parsed["findings"] == ["a"]


def test_extract_json_object_repairs_missing_array_object_commas():
    content = """
    {
      "summary": "ok",
      "recommendations": [
        {"priority": "high", "category": "optimization", "action": "A", "reason": "R"}
        {"priority": "low", "category": "dataset", "action": "B", "reason": "S"}
      ]
    }
    """

    parsed = llm_analyst_service._extract_json_object(content)

    assert len(parsed["recommendations"]) == 2
    assert parsed["recommendations"][1]["action"] == "B"


def test_provider_config_defaults_to_deepseek_when_key_present(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.delenv("MIMO_API_KEY", raising=False)
    monkeypatch.delenv("MIMO_BASE_URL", raising=False)
    monkeypatch.delenv("MIMO_MODEL", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    cfg = llm_analyst_service.get_provider_config()

    assert cfg["enabled"] is True
    assert cfg["provider"] == "deepseek"
    assert cfg["base_url"] == "https://api.deepseek.com"
    assert cfg["model"] == "deepseek-chat"


def test_provider_config_defaults_to_mimo_when_mimo_key_present(monkeypatch):
    monkeypatch.setenv("MIMO_API_KEY", "test-mimo-key")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    cfg = llm_analyst_service.get_provider_config()

    assert cfg["enabled"] is True
    assert cfg["provider"] == "mimo"
    assert cfg["base_url"] == "https://token-plan-sgp.xiaomimimo.com/v1"
    assert cfg["model"] == "mimo-v2.5"


def test_provider_config_supports_explicit_mimo_provider(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "mimo")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.delenv("MIMO_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)

    cfg = llm_analyst_service.get_provider_config()

    assert cfg["enabled"] is True
    assert cfg["provider"] == "mimo"
    assert cfg["base_url"] == "https://token-plan-sgp.xiaomimimo.com/v1"
    assert cfg["model"] == "mimo-v2.5"


def test_summarize_context_omits_empty_metrics_and_zero_graph_count():
    context = llm_analyst_service._summarize_context(
        snapshots=[{
            "val_acc": 0.91543,
            "train_acc": 0.91541,
            "train_loss": 0.4548,
            "val_loss": 0.4730,
            "macro_f1": None,
            "ece": None,
        }],
        model_type="GCN",
        config={"dataset": "Cora"},
        graph_payload={
            "graph_data": {
                "nodes": [{"id": i} for i in range(4)],
                "links": [{"source": 0, "target": 1}, {"source": 1, "target": 2}],
            },
            "task_data": {"graphs": []},
        },
    )

    assert context["final_metrics"] == {
        "validation_accuracy": 0.9154,
        "training_accuracy": 0.9154,
        "training_loss": 0.4548,
        "validation_loss": 0.473,
    }
    assert "graphs" not in context["graph_counts"]
    assert context["derived_metrics"]["average_degree"] == 1.0
    assert context["derived_metrics"]["train_validation_accuracy_gap"] == 0.0


def test_polish_vietnamese_text_replaces_raw_metric_keys():
    text = "val_acc tot nhung macro_f1 missing va sparse graph can duoc doc ky."

    polished = llm_analyst_service._polish_text(text, "vi")

    assert "val_acc" not in polished
    assert "missing" not in polished
    assert "sparse graph" not in polished
    assert "do chinh xac validation" in polished
    assert "chua co" in polished


def test_generate_recommendation_brief_parses_openai_compatible_response(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.delenv("MIMO_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)

    class MockResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"summary":"Class 1 recall is the weak point.",'
                                '"findings":["Recall is lagging on the weak class."],'
                                '"risks":["Density shortcut may inflate confidence."],'
                                '"next_steps":["Use Macro F1 to select the best epoch."],'
                                '"detailed_analysis":[{"title":"Metric read","body":"Macro F1 trails accuracy."}],'
                                '"recommendations":[{"priority":"high","category":"optimization",'
                                '"action":"Select checkpoint by Macro F1",'
                                '"reason":"Accuracy hides the weak-class drop.",'
                                '"expected_impact":"More reliable model selection."}]}'
                            )
                        }
                    }
                ]
            }

    monkeypatch.setattr(llm_analyst_service.httpx, "post", lambda *args, **kwargs: MockResponse())

    result = llm_analyst_service.generate_recommendation_brief(
        snapshots=[{"val_acc": 0.68, "macro_f1": 0.62}],
        model_type="GAT",
        config={"dataset": "PROTEINS"},
        graph_payload={},
        heuristic_payload={"summary": "Heuristic summary", "recommendations": []},
    )

    assert result["source"] == "llm"
    assert result["summary"] == "Class 1 recall is the weak point."
    assert result["analyst_brief"]["findings"] == ["Recall is lagging on the weak class."]
    assert result["analyst_brief"]["risks"] == ["Density shortcut may inflate confidence."]
    assert result["detailed_analysis"] == [{"title": "Metric read", "body": "Macro F1 trails accuracy."}]
    assert result["recommendation_count"] == 1
    assert result["priority_counts"]["high"] == 1
    assert result["recommendations"][0]["action"] == "Select checkpoint by Macro F1"


def test_generate_research_notes_returns_none_without_sections(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.delenv("MIMO_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)

    class MockResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": '{"summary":"missing sections"}'}}]}

    monkeypatch.setattr(llm_analyst_service.httpx, "post", lambda *args, **kwargs: MockResponse())

    result = llm_analyst_service.generate_research_notes(
        snapshots=[{"val_acc": 0.7}],
        model_type="GCN",
        config={"dataset": "MUTAG"},
        graph_payload={},
        heuristic_payload={"notes": "fallback", "sections": [{"title": "Summary", "content": "fallback"}]},
    )

    assert result is None


def test_mimo_401_auth_failure_is_circuit_broken(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "mimo")
    monkeypatch.setenv("LLM_API_KEY", "bad-key")
    monkeypatch.setenv("LLM_MODEL", "mimo-v2.5")
    monkeypatch.setenv("LLM_BASE_URL", "https://token-plan-sgp.xiaomimimo.com/v1")
    monkeypatch.delenv("MIMO_AUTH_MODE", raising=False)

    llm_analyst_service._AUTH_FAILURE_STATE["signature"] = None
    llm_analyst_service._AUTH_FAILURE_STATE["provider"] = None
    llm_analyst_service._AUTH_FAILURE_STATE["message"] = None

    call_count = {"value": 0}

    class MockResponse:
        status_code = 401

        def raise_for_status(self):
            request = httpx.Request("POST", "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions")
            response = httpx.Response(401, request=request)
            raise httpx.HTTPStatusError("401 Unauthorized", request=request, response=response)

        def json(self):
            return {}

    def fake_post(*args, **kwargs):
        call_count["value"] += 1
        return MockResponse()

    monkeypatch.setattr(llm_analyst_service.httpx, "post", fake_post)

    first = llm_analyst_service.generate_recommendation_brief(
        snapshots=[{"val_acc": 0.72}],
        model_type="GCN",
        config={"dataset": "Cora"},
        graph_payload={},
        heuristic_payload={"summary": "fallback", "recommendations": []},
    )
    second = llm_analyst_service.generate_recommendation_brief(
        snapshots=[{"val_acc": 0.72}],
        model_type="GCN",
        config={"dataset": "Cora"},
        graph_payload={},
        heuristic_payload={"summary": "fallback", "recommendations": []},
    )

    assert first is None
    assert second is None
    assert call_count["value"] == 1
    status = llm_analyst_service.get_public_status()
    assert status["enabled"] is False
    assert status["configured"] is True
    assert status["auth_failure"] is not None
