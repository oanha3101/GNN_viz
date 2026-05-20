import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services import llm_analyst_service


def test_provider_config_defaults_to_deepseek_when_key_present(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    cfg = llm_analyst_service.get_provider_config()

    assert cfg["enabled"] is True
    assert cfg["provider"] == "deepseek"
    assert cfg["base_url"] == "https://api.deepseek.com"
    assert cfg["model"] == "deepseek-chat"


def test_generate_recommendation_brief_parses_openai_compatible_response(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")

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
                                '"next_steps":["Use Macro F1 to select the best epoch."]}'
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


def test_generate_research_notes_returns_none_without_sections(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")

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
