from typing import Any, Iterable, Optional


def build_list_response(
    items: Iterable[Any],
    *,
    total: Optional[int] = None,
    page: int = 1,
    page_size: Optional[int] = None,
) -> dict:
    materialized = list(items)
    return {
        "items": materialized,
        "total": total if total is not None else len(materialized),
        "page": page,
        "page_size": page_size if page_size is not None else len(materialized),
    }
