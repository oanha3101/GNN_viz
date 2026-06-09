import json
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


def _is_truthy(value: Optional[str]) -> bool:
    return str(value or "").strip().lower() not in {"", "0", "false", "no", "off"}


def get_provider_config() -> Dict[str, Any]:
    provider = os.getenv("LLM_PROVIDER") or ("deepseek" if os.getenv("DEEPSEEK_API_KEY") else "heuristic")
    api_key = os.getenv("LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    base_url = os.getenv("LLM_BASE_URL") or ("https://api.deepseek.com" if provider == "deepseek" else "")
    model = os.getenv("LLM_MODEL") or os.getenv("DEEPSEEK_MODEL") or ("deepseek-chat" if provider == "deepseek" else "")
    timeout_seconds = float(os.getenv("LLM_TIMEOUT_SECONDS", "20"))
    enabled = _is_truthy(os.getenv("LLM_ANALYST_ENABLED", "1")) and bool(api_key and base_url and model)
    return {
        "provider": provider,
        "api_key": api_key,
        "base_url": base_url.rstrip("/"),
        "model": model,
        "timeout_seconds": timeout_seconds,
        "enabled": enabled,
    }


def get_public_status() -> Dict[str, Any]:
    cfg = get_provider_config()
    return {
        "enabled": cfg["enabled"],
        "provider": cfg["provider"],
        "model": cfg["model"] if cfg["enabled"] else None,
    }


def _pick_metric(snapshot: Dict[str, Any], *keys: str) -> Optional[float]:
    for key in keys:
        value = snapshot.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _summarize_context(
    snapshots: List[Dict[str, Any]],
    model_type: str,
    config: Optional[Dict[str, Any]],
    graph_payload: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    config = config or {}
    graph_payload = graph_payload or {}
    last_snap = snapshots[-1] if snapshots else {}
    graph_data = graph_payload.get("graph_data_json") or graph_payload.get("graph_data") or {}
    task_data = graph_payload.get("task_data_json") or graph_payload.get("task_data") or {}

    return {
        "model_type": model_type,
        "dataset": config.get("dataset") or config.get("dataset_name") or "unknown",
        "epoch_count": len(snapshots),
        "final_metrics": {
            "val_acc": _pick_metric(last_snap, "val_acc", "accuracy"),
            "train_acc": _pick_metric(last_snap, "train_acc"),
            "macro_f1": _pick_metric(last_snap, "macro_f1", "graph_macro_f1"),
            "balanced_acc": _pick_metric(last_snap, "balanced_accuracy", "graph_balanced_accuracy"),
            "train_loss": _pick_metric(last_snap, "train_loss", "loss"),
            "val_loss": _pick_metric(last_snap, "val_loss"),
            "ece": _pick_metric(last_snap, "ece", "graph_ece"),
        },
        "graph_counts": {
            "nodes": len(graph_data.get("nodes", [])),
            "links": len(graph_data.get("links", [])),
            "graphs": len(task_data.get("graphs", [])),
        },
    }


def _extract_json_object(content: str) -> Dict[str, Any]:
    content = (content or "").strip()
    if not content:
        raise ValueError("Empty LLM response")

    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("LLM response did not contain a JSON object")

    parsed = json.loads(content[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("LLM JSON payload was not an object")
    return parsed


def _normalize_lines(values: Any) -> List[str]:
    if isinstance(values, list):
        return [str(v).strip() for v in values if str(v).strip()]
    if isinstance(values, str) and values.strip():
        return [values.strip()]
    return []


def _call_chat_completion(messages: List[Dict[str, str]]) -> Dict[str, Any]:
    cfg = get_provider_config()
    if not cfg["enabled"]:
        raise RuntimeError("LLM analyst is not configured")

    response = httpx.post(
        f"{cfg['base_url']}/chat/completions",
        headers={
            "Authorization": f"Bearer {cfg['api_key']}",
            "Content-Type": "application/json",
        },
        json={
            "model": cfg["model"],
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 900,
        },
        timeout=cfg["timeout_seconds"],
    )
    response.raise_for_status()
    payload = response.json()
    content = (((payload.get("choices") or [{}])[0]).get("message") or {}).get("content", "")
    data = _extract_json_object(content)
    data["_provider"] = cfg["provider"]
    data["_model"] = cfg["model"]
    return data


def generate_recommendation_brief(
    snapshots: List[Dict[str, Any]],
    model_type: str = "GCN",
    config: Optional[Dict[str, Any]] = None,
    graph_payload: Optional[Dict[str, Any]] = None,
    heuristic_payload: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    cfg = get_provider_config()
    if not cfg["enabled"] or not snapshots:
        return None

    heuristic_payload = heuristic_payload or {}
    context = _summarize_context(snapshots, model_type, config, graph_payload)
    prompt = {
        "context": context,
        "heuristic_summary": heuristic_payload.get("summary"),
        "recommendations": heuristic_payload.get("recommendations", []),
    }
    messages = [
        {
            "role": "system",
            "content": (
                "You are an explainable GNN research analyst. "
                "Return strict JSON with keys: summary, findings, risks, next_steps. "
                "Keep it concise, concrete, and research-oriented."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(prompt, ensure_ascii=True),
        },
    ]

    try:
        data = _call_chat_completion(messages)
    except Exception as exc:
        logger.warning("LLM recommendation brief failed: %s", exc)
        return None

    return {
        "summary": str(data.get("summary") or heuristic_payload.get("summary") or "").strip(),
        "analyst_brief": {
            "findings": _normalize_lines(data.get("findings")),
            "risks": _normalize_lines(data.get("risks")),
            "next_steps": _normalize_lines(data.get("next_steps")),
        },
        "source": "llm",
        "llm": {
            "enabled": True,
            "provider": data.get("_provider"),
            "model": data.get("_model"),
        },
    }


def generate_research_notes(
    snapshots: List[Dict[str, Any]],
    model_type: str = "GCN",
    config: Optional[Dict[str, Any]] = None,
    graph_payload: Optional[Dict[str, Any]] = None,
    heuristic_payload: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    cfg = get_provider_config()
    if not cfg["enabled"] or not snapshots:
        return None

    heuristic_payload = heuristic_payload or {}
    context = _summarize_context(snapshots, model_type, config, graph_payload)
    prompt = {
        "context": context,
        "heuristic_sections": heuristic_payload.get("sections", []),
        "heuristic_notes": heuristic_payload.get("notes"),
    }
    messages = [
        {
            "role": "system",
            "content": (
                "You are an explainable GNN research analyst. "
                "Return strict JSON with keys: sections. "
                "sections must be a list of objects with title and content. "
                "Write concise, practical research notes."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(prompt, ensure_ascii=True),
        },
    ]

    try:
        data = _call_chat_completion(messages)
    except Exception as exc:
        logger.warning("LLM research notes failed: %s", exc)
        return None

    sections = []
    for section in data.get("sections", []):
        title = str((section or {}).get("title") or "").strip()
        content = str((section or {}).get("content") or "").strip()
        if title and content:
            sections.append({"title": title, "content": content})

    if not sections:
        return None

    notes = "\n\n".join(f"## {section['title']}\n{section['content']}" for section in sections)
    return {
        "notes": notes,
        "sections": sections,
        "generated_at": "llm",
        "source": "llm",
        "llm": {
            "enabled": True,
            "provider": data.get("_provider"),
            "model": data.get("_model"),
        },
    }
