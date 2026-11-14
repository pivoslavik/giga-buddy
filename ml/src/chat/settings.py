import os


def read_context_limit(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        limit = int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a non-negative integer") from exc
    if limit < 0:
        raise ValueError(f"{name} must be a non-negative integer")
    return limit
