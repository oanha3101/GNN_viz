import json
import logging
import os
import re
import threading
from hashlib import sha256
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


PROVIDER_DEFAULTS = {
    "deepseek": {
        "api_key_env": "DEEPSEEK_API_KEY",
        "base_url_env": None,
        "model_env": "DEEPSEEK_MODEL",
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-chat",
    },
    "mimo": {
        "api_key_env": "MIMO_API_KEY",
        "base_url_env": "MIMO_BASE_URL",
        "model_env": "MIMO_MODEL",
        "base_url": "https://token-plan-sgp.xiaomimimo.com/v1",
        "model": "mimo-v2.5",
    },
}


_AUTH_FAILURE_STATE: Dict[str, Optional[str]] = {
    "signature": None,
    "provider": None,
    "message": None,
}
_AUTH_FAILURE_LOCKS: Dict[str, threading.Lock] = {}
_AUTH_FAILURE_LOCKS_GUARD = threading.Lock()


def _is_truthy(value: Optional[str]) -> bool:
    return str(value or "").strip().lower() not in {"", "0", "false", "no", "off"}


def _infer_provider() -> str:
    explicit = os.getenv("LLM_PROVIDER")
    if explicit:
        return explicit.strip().lower()
    if os.getenv("MIMO_API_KEY"):
        return "mimo"
    if os.getenv("DEEPSEEK_API_KEY"):
        return "deepseek"
    return "heuristic"


def _config_signature(provider: str, api_key: Optional[str], base_url: str, model: str) -> str:
    raw = "||".join([
        provider or "",
        base_url or "",
        model or "",
        api_key or "",
    ])
    return sha256(raw.encode("utf-8")).hexdigest()


def _get_auth_failure(signature: str) -> Optional[Dict[str, str]]:
    if _AUTH_FAILURE_STATE.get("signature") != signature:
        return None
    if not _AUTH_FAILURE_STATE.get("message"):
        return None
    return {
        "provider": _AUTH_FAILURE_STATE.get("provider") or "unknown",
        "message": _AUTH_FAILURE_STATE.get("message") or "Authentication failed",
    }


def _remember_auth_failure(signature: str, provider: str, message: str) -> None:
    _AUTH_FAILURE_STATE["signature"] = signature
    _AUTH_FAILURE_STATE["provider"] = provider
    _AUTH_FAILURE_STATE["message"] = message


def _clear_auth_failure(signature: str) -> None:
    if _AUTH_FAILURE_STATE.get("signature") != signature:
        return
    _AUTH_FAILURE_STATE["signature"] = None
    _AUTH_FAILURE_STATE["provider"] = None
    _AUTH_FAILURE_STATE["message"] = None


def _get_signature_lock(signature: str) -> threading.Lock:
    with _AUTH_FAILURE_LOCKS_GUARD:
        lock = _AUTH_FAILURE_LOCKS.get(signature)
        if lock is None:
            lock = threading.Lock()
            _AUTH_FAILURE_LOCKS[signature] = lock
        return lock


def get_provider_config() -> Dict[str, Any]:
    provider = _infer_provider()
    defaults = PROVIDER_DEFAULTS.get(provider, {})
    provider_key_env = defaults.get("api_key_env")
    provider_base_env = defaults.get("base_url_env")
    provider_model_env = defaults.get("model_env")

    api_key = (
        os.getenv("LLM_API_KEY")
        or (os.getenv(provider_key_env) if provider_key_env else None)
        or os.getenv("DEEPSEEK_API_KEY")
    )
    base_url = (
        os.getenv("LLM_BASE_URL")
        or (os.getenv(provider_base_env) if provider_base_env else None)
        or defaults.get("base_url", "")
    )
    model = (
        os.getenv("LLM_MODEL")
        or (os.getenv(provider_model_env) if provider_model_env else None)
        or os.getenv("DEEPSEEK_MODEL")
        or defaults.get("model", "")
    )
    timeout_seconds = float(os.getenv("LLM_TIMEOUT_SECONDS", "20"))
    configured = _is_truthy(os.getenv("LLM_ANALYST_ENABLED", "1")) and bool(api_key and base_url and model)
    signature = _config_signature(provider, api_key, base_url.rstrip("/"), model)
    auth_failure = _get_auth_failure(signature)
    enabled = configured and auth_failure is None
    return {
        "provider": provider,
        "api_key": api_key,
        "base_url": base_url.rstrip("/"),
        "model": model,
        "timeout_seconds": timeout_seconds,
        "enabled": enabled,
        "configured": configured,
        "auth_failure": auth_failure,
        "signature": signature,
    }


def get_public_status() -> Dict[str, Any]:
    cfg = get_provider_config()
    return {
        "enabled": cfg["enabled"],
        "configured": cfg["configured"],
        "provider": cfg["provider"],
        "model": cfg["model"] if cfg["enabled"] else None,
        "auth_failure": cfg["auth_failure"],
    }


def _pick_metric(snapshot: Dict[str, Any], *keys: str) -> Optional[float]:
    for key in keys:
        value = snapshot.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _round_metric(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), 4)


def _compact_numeric_map(values: Dict[str, Optional[float]]) -> Dict[str, float]:
    return {key: _round_metric(value) for key, value in values.items() if value is not None}


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
    nodes = len(graph_data.get("nodes", []))
    links = len(graph_data.get("links", []))
    graphs = len(task_data.get("graphs", []))
    val_acc = _pick_metric(last_snap, "val_acc", "accuracy")
    train_acc = _pick_metric(last_snap, "train_acc")
    train_loss = _pick_metric(last_snap, "train_loss", "loss")
    val_loss = _pick_metric(last_snap, "val_loss")

    final_metrics = _compact_numeric_map({
        "validation_accuracy": val_acc,
        "training_accuracy": train_acc,
        "macro_f1": _pick_metric(last_snap, "macro_f1", "graph_macro_f1"),
        "balanced_accuracy": _pick_metric(last_snap, "balanced_accuracy", "graph_balanced_accuracy"),
        "training_loss": train_loss,
        "validation_loss": val_loss,
        "calibration_error_ece": _pick_metric(last_snap, "ece", "graph_ece"),
    })
    derived_metrics = _compact_numeric_map({
        "train_validation_accuracy_gap": abs(train_acc - val_acc) if train_acc is not None and val_acc is not None else None,
        "validation_loss_minus_training_loss": val_loss - train_loss if val_loss is not None and train_loss is not None else None,
        "average_degree": (2 * links / nodes) if nodes else None,
        "edge_to_node_ratio": (links / nodes) if nodes else None,
    })
    graph_counts = {"nodes": nodes, "links": links}
    if graphs > 0:
        graph_counts["graphs"] = graphs

    return {
        "model_type": model_type,
        "dataset": config.get("dataset") or config.get("dataset_name") or "unknown",
        "epoch_count": len(snapshots),
        "final_metrics": final_metrics,
        "derived_metrics": derived_metrics,
        "graph_counts": graph_counts,
        "interpretation_hints": [
            "Metrics omitted from final_metrics are not available; do not present them as a primary weakness.",
            "If graphs is absent, treat the task as a single graph or unspecified graph count; do not mention graphs=0.",
            "Explain what the numbers mean for the user instead of repeating raw field names.",
        ],
    }


def _extract_json_object(content: str) -> Dict[str, Any]:
    content = (content or "").strip()
    if not content:
        raise ValueError("Empty LLM response")

    if content.startswith("```"):
        lines = content.splitlines()
        if lines and lines[0].lstrip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        content = "\n".join(lines).strip()

    parsed = _loads_json_object(content)
    if parsed is not None:
        return parsed

    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("LLM response did not contain a JSON object")

    candidate = content[start : end + 1]
    parsed = _loads_json_object(candidate)
    if parsed is not None:
        return parsed

    repaired = _repair_json_candidate(candidate)
    parsed = _loads_json_object(repaired)
    if parsed is not None:
        return parsed

    # Raise from the original candidate so logs point near the model's real error.
    json.loads(candidate)
    raise ValueError("LLM JSON payload was not an object")


def _loads_json_object(content: str) -> Optional[Dict[str, Any]]:
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _repair_json_candidate(content: str) -> str:
    repaired = content.strip()
    # Mimo occasionally omits separators between lines while still returning
    # otherwise valid JSON-shaped content.
    repaired = re.sub(r'([}\]"])\s*\n\s*("[A-Za-z_][A-Za-z0-9_]*"\s*:)', r'\1,\n\2', repaired)
    repaired = re.sub(r'(-?\d(?:\.\d+)?)\s*\n\s*("[A-Za-z_][A-Za-z0-9_]*"\s*:)', r'\1,\n\2', repaired)
    repaired = re.sub(r'\b(true|false|null)\s*\n\s*("[A-Za-z_][A-Za-z0-9_]*"\s*:)', r'\1,\n\2', repaired)
    repaired = re.sub(r'}\s*\n\s*{', r'},\n{', repaired)
    repaired = re.sub(r',\s*([}\]])', r'\1', repaired)
    return repaired


def _normalize_lines(values: Any) -> List[str]:
    if isinstance(values, list):
        return [str(v).strip() for v in values if str(v).strip()]
    if isinstance(values, str) and values.strip():
        return [values.strip()]
    return []


def _normalize_sections(values: Any) -> List[Dict[str, str]]:
    sections = []
    if not isinstance(values, list):
        return sections
    for item in values:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or item.get("content") or "").strip()
        if title and body:
            sections.append({"title": title, "body": body})
    return sections


def _normalize_recommendations(values: Any, fallback: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(values, list):
        return fallback

    normalized = []
    allowed_priorities = {"high", "moderate", "low"}
    allowed_categories = {
        "architecture",
        "regularization",
        "optimization",
        "model_selection",
        "loss_function",
        "dataset",
    }
    for item in values:
        if not isinstance(item, dict):
            continue
        action = str(item.get("action") or "").strip()
        reason = str(item.get("reason") or "").strip()
        if not action or not reason:
            continue
        priority = str(item.get("priority") or "moderate").strip().lower()
        category = str(item.get("category") or "optimization").strip().lower()
        normalized.append({
            "priority": priority if priority in allowed_priorities else "moderate",
            "category": category if category in allowed_categories else "optimization",
            "action": action,
            "reason": reason,
            "expected_impact": str(item.get("expected_impact") or "").strip(),
        })
    return normalized or fallback


def _normalize_insights(values: Any, fallback: List[Dict[str, Any]], lang: str) -> List[Dict[str, Any]]:
    if not isinstance(values, list):
        return fallback

    normalized = []
    allowed_significance = {"high", "moderate", "low"}
    for item in values:
        if not isinstance(item, dict):
            continue
        title = _polish_text(item.get("title"), lang)
        finding = _polish_text(item.get("finding"), lang)
        if not title or not finding:
            continue
        normalized.append({
            "type": str(item.get("type") or "llm").strip().lower() or "llm",
            "title": title,
            "finding": finding,
            "details": _polish_lines(item.get("details"), lang),
            "recommendation": _polish_text(item.get("recommendation"), lang),
            "significance": str(item.get("significance") or "moderate").strip().lower()
            if str(item.get("significance") or "moderate").strip().lower() in allowed_significance
            else "moderate",
        })
    return normalized or fallback


VI_TEXT_REPLACEMENTS = {
    "val_acc": "do chinh xac validation",
    "train_acc": "do chinh xac training",
    "val_loss": "loss validation",
    "train_loss": "loss training",
    "macro_f1": "Macro F1",
    "balanced_acc": "balanced accuracy",
    "balanced_accuracy": "balanced accuracy",
    "ece": "sai so calibration",
    "missing metrics": "chi so chua co",
    "missing": "chua co",
    "Potentially": "Co the",
    "potentially": "co the",
    "dependences": "quan he phu thuoc",
    "dependencies": "quan he phu thuoc",
    "sparse graph": "do thi thua",
    "sparse": "thua",
}


def _polish_text(value: Any, lang: str) -> str:
    text = str(value or "").strip()
    if lang != "vi" or not text:
        return text
    for source, replacement in VI_TEXT_REPLACEMENTS.items():
        text = text.replace(source, replacement)
    return text


def _polish_lines(values: Any, lang: str) -> List[str]:
    return [_polish_text(value, lang) for value in _normalize_lines(values)]


def _polish_sections(values: Any, lang: str) -> List[Dict[str, str]]:
    return [
        {
            "title": _polish_text(section["title"], lang),
            "body": _polish_text(section["body"], lang),
        }
        for section in _normalize_sections(values)
    ]


def _polish_recommendations(recommendations: List[Dict[str, Any]], lang: str) -> List[Dict[str, Any]]:
    if lang != "vi":
        return recommendations
    polished = []
    for item in recommendations:
        polished.append({
            **item,
            "action": _polish_text(item.get("action"), lang),
            "reason": _polish_text(item.get("reason"), lang),
            "expected_impact": _polish_text(item.get("expected_impact"), lang),
        })
    return polished


def _priority_counts(recommendations: List[Dict[str, Any]]) -> Dict[str, int]:
    return {
        "high": sum(1 for item in recommendations if item.get("priority") == "high"),
        "moderate": sum(1 for item in recommendations if item.get("priority") == "moderate"),
        "low": sum(1 for item in recommendations if item.get("priority") == "low"),
    }


def _build_auth_header_candidates(cfg: Dict[str, Any]) -> List[Dict[str, str]]:
    provider = cfg["provider"]
    api_key = cfg["api_key"]
    if provider != "mimo":
        return [{"Authorization": f"Bearer {api_key}"}]

    auth_mode = str(os.getenv("MIMO_AUTH_MODE", "auto")).strip().lower()
    if auth_mode == "api-key":
        return [{"api-key": api_key}]
    if auth_mode == "x-api-key":
        return [{"x-api-key": api_key}]
    if auth_mode == "auto":
        return [
            {"Authorization": f"Bearer {api_key}"},
            {"api-key": api_key},
            {"x-api-key": api_key},
        ]
    return [{"Authorization": f"Bearer {api_key}"}]


def _call_chat_completion(messages: List[Dict[str, str]]) -> Dict[str, Any]:
    cfg = get_provider_config()
    if not cfg["enabled"]:
        if cfg.get("auth_failure"):
            raise RuntimeError(
                f"LLM analyst authentication is temporarily disabled for provider "
                f"{cfg['provider']}: {cfg['auth_failure']['message']}"
            )
        raise RuntimeError("LLM analyst is not configured")

    payload = {
        "model": cfg["model"],
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 3200,
    }
    url = f"{cfg['base_url']}/chat/completions"
    auth_header_candidates = _build_auth_header_candidates(cfg)

    with _get_signature_lock(cfg["signature"]):
        auth_failure = _get_auth_failure(cfg["signature"])
        if auth_failure:
            raise RuntimeError(
                f"LLM analyst authentication is temporarily disabled for provider "
                f"{cfg['provider']}: {auth_failure['message']}"
            )

        last_http_error: Optional[httpx.HTTPStatusError] = None
        response = None
        for extra_headers in auth_header_candidates:
            response = httpx.post(
                url,
                headers={
                    **extra_headers,
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=cfg["timeout_seconds"],
            )
            try:
                response.raise_for_status()
                _clear_auth_failure(cfg["signature"])
                break
            except httpx.HTTPStatusError as exc:
                last_http_error = exc
                if response.status_code not in {401, 403}:
                    raise
                continue

        if response is None:
            raise RuntimeError("LLM request did not produce a response")
        if last_http_error is not None and response.status_code in {401, 403}:
            message = f"HTTP {response.status_code} Unauthorized for {url}"
            _remember_auth_failure(cfg["signature"], cfg["provider"], message)
            raise RuntimeError(message) from last_http_error

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
    lang: str = "en",
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
        "language": "Vietnamese" if lang == "vi" else "English",
    }
    messages = [
        {
            "role": "system",
            "content": (
                "Return one valid JSON object only. Do not use markdown, prose, or code fences. "
                "You are an explainable GNN analyst. "
                "Write in the requested language. Cite numeric metrics from the input. "
                "For Vietnamese, use natural, plain Vietnamese for a non-specialist dashboard reader. "
                "Do not mix English words unless they are model names or standard metric names such as AUC, F1, GCN, GAT, GraphSAGE. "
                "Do not complain about omitted or unavailable metrics unless the available evidence truly cannot support a conclusion. "
                "Do not mention graphs=0. If graph count is absent, ignore it. "
                "Explain the meaning of metrics, not just the raw key names. "
                "Start the summary with the main conclusion, then one concrete reason. "
                "Keep findings, risks, and next_steps short and actionable. "
                "JSON keys required: summary, findings, risks, next_steps, detailed_analysis, recommendations. "
                "detailed_analysis has 2-4 objects with title and body. "
                "recommendations has 2-4 objects with priority, category, action, reason, expected_impact."
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
        log_fn = logger.info if "temporarily disabled" in str(exc) else logger.warning
        log_fn("LLM recommendation brief failed: %s", exc)
        return None

    llm_recommendations = _normalize_recommendations(
        data.get("recommendations"),
        heuristic_payload.get("recommendations", []),
    )
    llm_recommendations = _polish_recommendations(llm_recommendations, lang)
    return {
        "summary": _polish_text(data.get("summary") or heuristic_payload.get("summary") or "", lang),
        "recommendations": llm_recommendations,
        "recommendation_count": len(llm_recommendations),
        "priority_counts": _priority_counts(llm_recommendations),
        "analyst_brief": {
            "findings": _polish_lines(data.get("findings"), lang),
            "risks": _polish_lines(data.get("risks"), lang),
            "next_steps": _polish_lines(data.get("next_steps"), lang),
        },
        "detailed_analysis": _polish_sections(data.get("detailed_analysis"), lang),
        "source": "llm",
        "llm": {
            "enabled": True,
            "provider": data.get("_provider"),
            "model": data.get("_model"),
        },
    }


def generate_comparison_brief(
    comparison_payload: Dict[str, Any],
    lang: str = "en",
) -> Optional[Dict[str, Any]]:
    cfg = get_provider_config()
    if not cfg["enabled"] or not comparison_payload:
        return None

    heuristic_insights = list(comparison_payload.get("insights") or [])
    leaderboard = list(comparison_payload.get("leaderboard") or [])
    prompt = {
        "comparison_summary": comparison_payload.get("summary"),
        "winner": comparison_payload.get("winner"),
        "leaderboard": leaderboard[:4],
        "heuristic_insights": heuristic_insights[:5],
        "next_steps": comparison_payload.get("next_steps", []),
        "language": "Vietnamese" if lang == "vi" else "English",
    }
    messages = [
        {
            "role": "system",
            "content": (
                "Return one valid JSON object only. Do not use markdown, prose, or code fences. "
                "You are an explainable GNN comparison analyst. "
                "Write in the requested language and stay faithful to the supplied numbers. "
                "For Vietnamese, use natural, plain Vietnamese. "
                "Do not invent metrics or claims that are not supported by the provided comparison payload. "
                "Keep conclusions concrete and decisive, but short. "
                "Required JSON keys: summary, findings, next_steps, insights. "
                "insights must be a list of 3 to 5 objects with keys: type, title, finding, details, recommendation, significance. "
                "Each finding should compare runs directly, not describe them in isolation."
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
        log_fn = logger.info if "temporarily disabled" in str(exc) else logger.warning
        log_fn("LLM comparison brief failed: %s", exc)
        return None

    return {
        "summary": _polish_text(data.get("summary") or comparison_payload.get("summary") or "", lang),
        "insights": _normalize_insights(data.get("insights"), heuristic_insights, lang),
        "next_steps": _polish_lines(data.get("next_steps"), lang) or comparison_payload.get("next_steps", []),
        "analyst_brief": {
            "findings": _polish_lines(data.get("findings"), lang),
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
        log_fn = logger.info if "temporarily disabled" in str(exc) else logger.warning
        log_fn("LLM research notes failed: %s", exc)
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
