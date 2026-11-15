from mcp.server.fastmcp import Context

from ..tool_context import actions, caller, demo


async def action_get_draft(action_id: str, ctx: Context) -> dict[str, object]:
    """Прочитать сохранённый черновик для отдельного подтверждения."""
    return demo(**await actions(ctx).get_draft(caller(ctx), action_id))


TOOLS = (action_get_draft,)
