from __future__ import annotations

import math
from typing import Any, List, Tuple


def paginate(query, page: int, page_size: int) -> Tuple[List[Any], int]:
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def page_payload(items: List[Any], total: int, page: int, page_size: int) -> dict:
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, math.ceil(total / page_size)) if total else 0,
    }
