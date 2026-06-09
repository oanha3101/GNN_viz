"""Translate analytics service prose to Vietnamese.

The analytics service emits English narrative strings for recommendations,
research notes, and comparison insights. This module post-processes the
service output and replaces the English templates with Vietnamese equivalents
when ``lang="vi"`` is requested at the API layer.

The translator works on two layers:

1. **Exact pattern matching** — for fixed strings like
   "Training looks healthy — no major improvements needed.", we apply a
   straight dict lookup.

2. **Regex template matching** — for parameterised strings like
   "Train-val gap is {pct}% and widening.", we keep the templates as regexes
   and re-inject the captured groups into the VI template.

Strings that do not match any pattern fall through unchanged. This keeps the
translator safe: at worst the user sees the original English instead of a
crash.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

# ---------------------------------------------------------------------------
# Recommendations — title/action/reason/expected_impact
# ---------------------------------------------------------------------------

# Exact-match strings (no parameters). Keep this list in sync with
# analytics_service.generate_recommendations().
RECOMMENDATION_STRINGS_VI: Dict[str, str] = {
    # ── action ──
    "Add residual connections or reduce GNN layers":
        "Thêm kết nối residual hoặc giảm số tầng GNN",
    "Reduce attention heads or add attention entropy regularization":
        "Giảm số attention head hoặc thêm entropy regularization",
    "Increase GAT heads to capture diverse attention patterns":
        "Tăng số head của GAT để bắt nhiều mẫu attention đa dạng hơn",
    "Switch to GAT or add edge features for boundary node handling":
        "Đổi sang GAT hoặc thêm đặc trưng cạnh để xử lý các đỉnh biên",
    "Add contrastive loss or increase hidden dimension":
        "Thêm hàm contrastive hoặc tăng chiều ẩn (hidden)",
    # ── reason ──
    "Attention weights remain diffuse — the model is not learning to focus on informative neighbors.":
        "Trọng số attention vẫn loãng — mô hình chưa học cách tập trung vào hàng xóm thông tin.",
    "Current heads are redundant (high similarity between head distributions).":
        "Các head hiện tại trùng lặp (phân phối giữa các head quá giống nhau).",
    "Based on dataset topology analysis.":
        "Dựa trên phân tích cấu trúc tập dữ liệu.",
    # ── expected_impact ──
    "Preserve node distinction while maintaining neighborhood information.":
        "Giữ được sự phân biệt giữa các đỉnh mà vẫn duy trì thông tin lân cận.",
    "Reduce memorization and improve generalization.":
        "Giảm hiện tượng học thuộc và cải thiện khả năng tổng quát hoá.",
    "Faster convergence without sacrificing final performance.":
        "Hội tụ nhanh hơn mà không hy sinh hiệu năng cuối cùng.",
    "More discriminative neighbor selection.":
        "Lựa chọn hàng xóm có tính phân biệt cao hơn.",
    "Richer feature extraction from different attention perspectives.":
        "Trích xuất đặc trưng phong phú hơn từ nhiều góc nhìn attention khác nhau.",
    "Smoother training trajectory and more reliable convergence.":
        "Quỹ đạo huấn luyện mượt hơn và hội tụ đáng tin cậy hơn.",
    "Better class boundary discrimination.":
        "Phân biệt biên giữa các lớp tốt hơn.",
    "Better class separation in latent space.":
        "Tách lớp tốt hơn trong không gian biểu diễn.",
    "Better model-dataset compatibility.":
        "Cải thiện độ tương thích giữa mô hình và dữ liệu.",
}

# Templated strings with placeholders. Each tuple is (regex, vi_template).
# Use named groups so the VI template can refer to them with {name}.
RECOMMENDATION_TEMPLATES_VI: List[tuple] = [
    (
        re.compile(r"^Increase dropout from (?P<cur>\S+) to (?P<new>\S+) or add weight decay$"),
        "Tăng dropout từ {cur} lên {new} hoặc thêm weight decay",
    ),
    (
        re.compile(r"^Try higher learning rate \(current: (?P<lr>\S+)\) or learning rate scheduling$"),
        "Thử learning rate cao hơn (hiện tại: {lr}) hoặc dùng learning rate scheduling",
    ),
    (
        re.compile(r"^Reduce learning rate \(current: (?P<lr>\S+)\) or add gradient clipping$"),
        "Giảm learning rate (hiện tại: {lr}) hoặc thêm gradient clipping",
    ),
    (
        re.compile(r"^Over-smoothing risk is (?P<risk>\w+) \(energy collapsed to (?P<pct>[\d.]+)% of initial\)\.$"),
        "Nguy cơ over-smoothing ở mức {risk} (năng lượng giảm còn {pct}% so với ban đầu).",
    ),
    (
        re.compile(r"^Train-val gap is (?P<gap>[\d.]+)% and widening\.$"),
        "Khoảng cách train-val là {gap}% và đang nới rộng.",
    ),
    (
        re.compile(r"^Model takes (?P<n>\d+) epochs to reach 95% of best score\.$"),
        "Mô hình cần {n} epoch để đạt 95% điểm tốt nhất.",
    ),
    (
        re.compile(r"^Training is unstable \(CV=(?P<cv>[\d.]+)\)\.$"),
        "Huấn luyện không ổn định (CV={cv}).",
    ),
    (
        re.compile(r"^Only (?P<pct>[\d.]+)% of boundary nodes are correctly classified\.$"),
        "Chỉ {pct}% đỉnh biên được phân loại đúng.",
    ),
    (
        re.compile(r"^Inter/intra-class distance ratio is only (?P<r>[\d.]+)\.$"),
        "Tỉ lệ khoảng cách giữa các lớp / trong cùng lớp chỉ đạt {r}.",
    ),
]

# Dataset-topology recommendations (returned as plain strings from
# analyze_dataset_topology() and wrapped as "action" in the rec dict).
DATASET_TOPO_RECS_VI: Dict[str, str] = {
    "This dataset is strongly homophilic — GCN and GraphSAGE are natural fits for neighborhood aggregation.":
        "Tập dữ liệu này có tính đồng nhất (homophilic) mạnh — GCN và GraphSAGE là lựa chọn tự nhiên cho việc tổng hợp lân cận.",
    "GAT may provide marginal benefit over GCN since neighbors already share labels.":
        "GAT có thể chỉ mang lại lợi ích nhỏ so với GCN vì hàng xóm đã có nhãn giống nhau.",
    "This dataset is heterophilic — standard neighborhood aggregation may hurt. Consider GAT with learned attention or specialized heterophilic architectures.":
        "Tập dữ liệu này dị nhất (heterophilic) — tổng hợp lân cận chuẩn có thể gây hại. Hãy cân nhắc GAT với attention được học hoặc kiến trúc chuyên biệt cho heterophily.",
    "GraphSAGE with diverse sampling may handle heterophily better than GCN.":
        "GraphSAGE với cách lấy mẫu đa dạng có thể xử lý heterophily tốt hơn GCN.",
    "Sparse graph structure — models with wider receptive fields or residual connections help propagate information.":
        "Đồ thị thưa — các mô hình có trường tiếp nhận rộng hoặc kết nối residual giúp lan truyền thông tin tốt hơn.",
    "Very low connectivity — consider adding virtual edges or using deeper architectures with skip connections.":
        "Mức kết nối rất thấp — cân nhắc thêm cạnh ảo hoặc dùng kiến trúc sâu hơn có skip connection.",
    "High connectivity — over-smoothing risk is elevated. Keep GNN layers shallow (2-3 max).":
        "Mức kết nối cao — nguy cơ over-smoothing tăng. Giữ số tầng GNN nông (tối đa 2-3).",
}

DATASET_TOPO_TEMPLATES_VI: List[tuple] = [
    (
        re.compile(r"^Many classes \((?P<n>\d+)\) — expect class confusion on similar categories\. Consider hierarchical classification\.$"),
        "Số lớp nhiều ({n}) — có thể có nhầm lẫn giữa các lớp tương tự. Cân nhắc phân loại phân cấp.",
    ),
]

# ---------------------------------------------------------------------------
# Research notes
# ---------------------------------------------------------------------------

# Section titles
SECTION_TITLES_VI: Dict[str, str] = {
    "Summary": "Tóm tắt",
    "Observations": "Quan sát",
    "Possible Causes": "Nguyên nhân khả dĩ",
    "Dataset Context": "Bối cảnh tập dữ liệu",
    "Suggested Next Experiments": "Thí nghiệm đề xuất tiếp theo",
}

# Severity / label words emitted in observation strings
OBS_LABEL_VI: Dict[str, str] = {
    "very_stable": "rất ổn định",
    "stable": "ổn định",
    "unstable": "không ổn định",
    "fragile": "mong manh",
    "healthy": "ổn",
    "mild_overfitting": "quá khớp nhẹ",
    "overfitting": "quá khớp",
    "severe_collapse": "sụp đổ nặng",
    "moderate_smoothing": "over-smoothing trung bình",
    "mild_smoothing": "over-smoothing nhẹ",
    "weak": "yếu",
    "strong": "mạnh",
    "moderate": "trung bình",
    "high": "cao",
    "low": "thấp",
    "diffuse": "loãng",
    "focused": "tập trung",
    "well_separated": "tách biệt tốt",
    "overlapping": "chồng lấp",
}

NEXT_EXP_VI: Dict[str, str] = {
    "Try reducing GNN layers or adding residual connections to combat over-smoothing.":
        "Thử giảm số tầng GNN hoặc thêm kết nối residual để chống over-smoothing.",
    "Increase regularization (dropout, weight decay) or use early stopping.":
        "Tăng regularization (dropout, weight decay) hoặc dùng early stopping.",
    "Compare with GAT to see if attention helps on boundary nodes.":
        "So sánh với GAT để xem attention có giúp các đỉnh biên không.",
    "Try different numbers of attention heads (2, 4, 8) to find the optimal configuration.":
        "Thử các số head attention khác nhau (2, 4, 8) để tìm cấu hình tối ưu.",
    "Compare this run with other model architectures on the same dataset.":
        "So sánh phiên chạy này với các kiến trúc mô hình khác trên cùng tập dữ liệu.",
    "Try different hidden dimensions (32, 64, 128) to find the sweet spot.":
        "Thử các chiều ẩn khác nhau (32, 64, 128) để tìm điểm tối ưu.",
}

# Templated observations
OBS_TEMPLATES_VI: List[tuple] = [
    (
        re.compile(r"^Training stability: (?P<label>\w+) \(CV=(?P<cv>[\d.NA/]+)\)\.$"),
        "Độ ổn định huấn luyện: {label_vi} (CV={cv}).",
        "label",
    ),
    (
        re.compile(r"^Overfitting assessment: (?P<label>\w+) \(gap=(?P<gap>[\d.]+)%\)\.$"),
        "Đánh giá quá khớp: {label_vi} (gap={gap}%).",
        "label",
    ),
    (
        re.compile(r"^Over-smoothing: (?P<label>\w+) \(energy at (?P<pct>[\d.]+)% of initial\)\.$"),
        "Over-smoothing: {label_vi} (năng lượng còn {pct}% so với ban đầu).",
        "label",
    ),
    (
        re.compile(r"^Boundary accuracy: (?P<pct>[\d.]+)% on (?P<n>\d+) boundary nodes\.$"),
        "Độ chính xác trên đỉnh biên: {pct}% trên {n} đỉnh biên.",
        None,
    ),
]

# Summary template: "{model} trained for {n} epochs on {ds} dataset. ..."
SUMMARY_TEMPLATE = re.compile(
    r"^(?P<model>\S+) trained for (?P<epochs>\d+) epochs on (?P<dataset>.+?) dataset\. "
    r"Final validation accuracy: (?P<acc>[\d.]+)%, training loss: (?P<loss>[\d.]+)\. "
    r"Best epoch: (?P<best>[\w/]+)\.$"
)
SUMMARY_VI = (
    "{model} đã huấn luyện {epochs} epoch trên tập {dataset}. "
    "Độ chính xác validation cuối: {acc}%, train loss: {loss}. "
    "Epoch tốt nhất: {best}."
)

# Dataset context template
DATASET_CTX_TEMPLATE = re.compile(
    r"^Dataset has (?P<nodes>\d+) nodes, (?P<edges>\d+) edges, (?P<cls>\d+) classes\. "
    r"Estimated homophily: (?P<hom>[\d.]+)\. Average degree: (?P<deg>[\d.]+)\.$"
)
DATASET_CTX_VI = (
    "Tập dữ liệu có {nodes} đỉnh, {edges} cạnh, {cls} lớp. "
    "Homophily ước lượng: {hom}. Bậc trung bình: {deg}."
)

# ---------------------------------------------------------------------------
# Recommendation summary builder
# ---------------------------------------------------------------------------

SUMMARY_TOP_PRIORITY = re.compile(r"^Top priority: (?P<text>.+)\.$")
SUMMARY_TOTAL = re.compile(r"^(?P<n>\d+) total recommendations across (?P<c>\d+) categories\.$")

# ---------------------------------------------------------------------------
# Comparison insight titles (used by ResearchInsightsPanel)
# ---------------------------------------------------------------------------

INSIGHT_TITLES_VI: Dict[str, str] = {
    "Convergence Speed": "Tốc độ hội tụ",
    "Convergence Trade-Off": "Đánh đổi tốc độ hội tụ",
    "Training Stability": "Độ ổn định huấn luyện",
    "Best Performer": "Phiên tốt nhất",
    "Overall Recommendation": "Khuyến nghị tổng quan",
    "Generalization Risk": "Rủi ro tổng quát hóa",
    "Dataset-Model Compatibility": "Độ tương thích mô hình - dữ liệu",
    "Heterophilic Challenge": "Thách thức heterophilic",
    "Severe Over-Smoothing Detected": "Phát hiện over-smoothing nặng",
    "Poor Boundary Node Accuracy": "Độ chính xác đỉnh biên thấp",
    "Overfitting Detected": "Phát hiện hiện tượng quá khớp",
    "GAT Attention Remains Diffuse": "Attention của GAT vẫn loãng",
    "Low Confidence on Sparse Nodes": "Độ tin cậy thấp trên các đỉnh thưa",
    "Embedding Classes Overlapping": "Các lớp embedding chồng lấp",
}

# Templated insight titles like "{model} Overfitting Signal" or "Class X Over-Prediction"
INSIGHT_TITLE_TEMPLATES_VI: List[tuple] = [
    (
        re.compile(r"^(?P<model>\S+) Overfitting Signal$"),
        "Dấu hiệu quá khớp của {model}",
    ),
    (
        re.compile(r"^Class (?P<c>\d+) Over-Prediction$"),
        "Dự đoán quá mức cho lớp {c}",
    ),
]

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _translate_exact_or_template(
    text: str,
    exact_map: Dict[str, str],
    templates: List[tuple],
) -> str:
    if not isinstance(text, str) or not text:
        return text
    if text in exact_map:
        return exact_map[text]
    for tpl in templates:
        regex, vi_template = tpl[0], tpl[1]
        m = regex.match(text)
        if m:
            return vi_template.format(**m.groupdict())
    return text


def _translate_action(text: str) -> str:
    return _translate_exact_or_template(text, RECOMMENDATION_STRINGS_VI, RECOMMENDATION_TEMPLATES_VI)


def _translate_dataset_rec(text: str) -> str:
    return _translate_exact_or_template(text, DATASET_TOPO_RECS_VI, DATASET_TOPO_TEMPLATES_VI)


def _translate_summary(text: str) -> str:
    """Translate the recommendations.summary aggregate text."""
    if not isinstance(text, str) or not text:
        return text
    parts = text.split(" ")
    # Simplest path: split by sentence-ish "Top priority: X."  + " N total ..." + " Training looks healthy ..."
    # We re-split by "." and translate each piece.
    out_segments = []
    for raw in re.split(r"(?<=\.) +", text):
        seg = raw.strip()
        if not seg:
            continue
        if seg == "Training looks healthy — no major improvements needed.":
            out_segments.append("Huấn luyện ổn định — không cần cải tiến lớn nào.")
            continue
        m = SUMMARY_TOP_PRIORITY.match(seg)
        if m:
            inner = m.group("text")
            # Try to translate the inner action through the same rec dict.
            translated = _translate_action(inner)
            out_segments.append(f"Ưu tiên hàng đầu: {translated}.")
            continue
        m = SUMMARY_TOTAL.match(seg)
        if m:
            out_segments.append(f"Tổng cộng {m.group('n')} khuyến nghị trong {m.group('c')} nhóm.")
            continue
        out_segments.append(seg)
    return " ".join(out_segments)


def translate_recommendations(payload: Dict[str, Any], lang: str) -> Dict[str, Any]:
    """Translate the dict returned by ``generate_recommendations()``.

    Mutates a shallow copy of ``payload``. Original payload is not changed.
    """
    if lang != "vi" or not isinstance(payload, dict):
        return payload

    result = dict(payload)
    recs = result.get("recommendations") or []
    new_recs = []
    for rec in recs:
        if not isinstance(rec, dict):
            new_recs.append(rec)
            continue
        new = dict(rec)
        category = new.get("category")
        action = new.get("action")
        if isinstance(action, str):
            if category == "dataset":
                new["action"] = _translate_dataset_rec(action)
            else:
                new["action"] = _translate_action(action)
        if isinstance(new.get("reason"), str):
            new["reason"] = _translate_action(new["reason"])
        if isinstance(new.get("expected_impact"), str):
            new["expected_impact"] = _translate_action(new["expected_impact"])
        new_recs.append(new)
    result["recommendations"] = new_recs

    if isinstance(result.get("summary"), str):
        result["summary"] = _translate_summary(result["summary"])

    return result


def _translate_observation(text: str) -> str:
    for regex, vi_template, label_field in OBS_TEMPLATES_VI:
        m = regex.match(text)
        if m:
            data = m.groupdict()
            if label_field and label_field in data:
                lbl_en = data[label_field]
                data["label_vi"] = OBS_LABEL_VI.get(lbl_en, lbl_en)
            return vi_template.format(**data)
    return text


def translate_research_notes(payload: Dict[str, Any], lang: str) -> Dict[str, Any]:
    """Translate the dict returned by ``generate_research_notes()``."""
    if lang != "vi" or not isinstance(payload, dict):
        return payload

    result = dict(payload)
    sections = result.get("sections") or []
    new_sections = []
    for section in sections:
        if not isinstance(section, dict):
            new_sections.append(section)
            continue
        new = dict(section)
        title = new.get("title")
        content = new.get("content")
        if isinstance(title, str):
            new["title"] = SECTION_TITLES_VI.get(title, title)

        if isinstance(content, str) and content:
            if title == "Summary":
                m = SUMMARY_TEMPLATE.match(content.strip())
                if m:
                    data = m.groupdict()
                    if data.get("dataset", "").strip().lower() == "current dataset":
                        data["dataset"] = "dữ liệu hiện tại"
                    new["content"] = SUMMARY_VI.format(**data)
            elif title == "Observations":
                # observations are space-joined sentences
                joined = " ".join(
                    _translate_observation(part.strip())
                    for part in re.split(r"(?<=\.) +", content)
                    if part.strip()
                )
                new["content"] = joined
            elif title == "Possible Causes":
                # bullets, untranslated for now (depends on free-form pattern titles from failure analysis)
                new["content"] = content
            elif title == "Dataset Context":
                m = DATASET_CTX_TEMPLATE.match(content.strip())
                if m:
                    new["content"] = DATASET_CTX_VI.format(**m.groupdict())
            elif title == "Suggested Next Experiments":
                lines = content.split("\n")
                translated_lines = []
                for line in lines:
                    stripped = line.lstrip("- ").strip()
                    vi = NEXT_EXP_VI.get(stripped, stripped)
                    if line.startswith("- "):
                        translated_lines.append(f"- {vi}")
                    else:
                        translated_lines.append(vi)
                new["content"] = "\n".join(translated_lines)
        new_sections.append(new)
    result["sections"] = new_sections

    # Rebuild `notes` markdown
    if "notes" in result and isinstance(result["notes"], str):
        result["notes"] = "\n\n".join(
            f"## {s.get('title', '')}\n{s.get('content', '')}" for s in new_sections
        )

    return result


def _translate_insight_title(text: str) -> str:
    if text in INSIGHT_TITLES_VI:
        return INSIGHT_TITLES_VI[text]
    for regex, vi_template in INSIGHT_TITLE_TEMPLATES_VI:
        m = regex.match(text)
        if m:
            return vi_template.format(**m.groupdict())
    return text


def translate_comparison_insights(payload: Dict[str, Any], lang: str) -> Dict[str, Any]:
    """Translate the dict returned by ``generate_comparison_insights()``."""
    if lang != "vi" or not isinstance(payload, dict):
        return payload

    result = dict(payload)
    insights = result.get("insights") or []
    new_insights = []
    if isinstance(insights, dict):
        # nested {"insights": [...], "summary": "..."} layout
        inner = dict(insights)
        items = inner.get("insights") or []
        new_items = []
        for it in items:
            if isinstance(it, dict):
                cp = dict(it)
                if isinstance(cp.get("title"), str):
                    cp["title"] = _translate_insight_title(cp["title"])
                new_items.append(cp)
            else:
                new_items.append(it)
        inner["insights"] = new_items
        result["insights"] = inner
    else:
        for it in insights:
            if isinstance(it, dict):
                cp = dict(it)
                if isinstance(cp.get("title"), str):
                    cp["title"] = _translate_insight_title(cp["title"])
                new_insights.append(cp)
            else:
                new_insights.append(it)
        result["insights"] = new_insights

    return result
