from mcp.server.fastmcp import Context

from ..knowledge import get_page, search_pages
from ..tool_context import caller, demo


def knowledge_search(query: str, ctx: Context) -> dict[str, object]:
    """Найти видимые инструкции Confluence по ключевым словам."""
    return demo(pages=search_pages(query, caller(ctx)))


def knowledge_get_page(page_id: str, ctx: Context) -> dict[str, object]:
    """Прочитать страницу по ID из ссылки Confluence."""
    user_id = caller(ctx)
    page = get_page(page_id, user_id)
    return demo(page=page) if page else demo(status="unavailable")


TOOLS = (
    knowledge_search,
    knowledge_get_page,
)
