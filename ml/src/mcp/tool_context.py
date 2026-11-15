import os
from hmac import compare_digest

from mcp.server.fastmcp import Context

from .actions import DemoActions


def caller(ctx: Context, *, submit: bool = False) -> int:
    request = ctx.request_context.request
    secret_name = "BUDDY_MCP_SUBMIT_TOKEN" if submit else "BUDDY_MCP_TOKEN"
    secret = os.getenv(secret_name)
    if submit and secret == os.getenv("BUDDY_MCP_TOKEN"):
        raise ValueError("Недоступно")
    if (
        request is None
        or not secret
        or not compare_digest(
            request.headers.get("authorization", "").encode(),
            f"Bearer {secret}".encode(),
        )
    ):
        raise ValueError("Недоступно")
    try:
        user_id = int(request.headers.get("x-buddy-user-id", ""))
    except ValueError:
        raise ValueError("Недоступно") from None
    if not 0 < user_id < 2**63:
        raise ValueError("Недоступно")
    return user_id


def demo(**data) -> dict[str, object]:
    return {"demo": True, **data}


def actions(ctx: Context) -> DemoActions:
    return ctx.request_context.request.app.state.actions
