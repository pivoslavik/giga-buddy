import os
from contextlib import asynccontextmanager
from hmac import compare_digest
from typing import Annotated, Literal

import asyncpg
from mcp.server.fastmcp import Context, FastMCP
from pydantic import Field

from .actions import ACCESS, PULL_REQUESTS, REVIEWER, DemoActions, absence_interval
from .knowledge import get_page, search_pages


@asynccontextmanager
async def lifespan(app):
    async with asyncpg.create_pool(
        os.environ["DATABASE_URL"],
        min_size=1,
        max_size=4,
        timeout=10,
        command_timeout=30,
    ) as pool:
        app.state.actions = DemoActions(pool)
        async with mcp.session_manager.run():
            yield


mcp = FastMCP("buddy-tools", host="0.0.0.0", stateless_http=True, json_response=True)


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


@mcp.tool()
def knowledge_search(query: str, ctx: Context) -> dict[str, object]:
    """Найти видимые инструкции Confluence по ключевым словам."""
    return demo(pages=search_pages(query, caller(ctx)))


@mcp.tool()
def knowledge_get_page(page_id: str, ctx: Context) -> dict[str, object]:
    """Прочитать страницу по ID из ссылки Confluence."""
    user_id = caller(ctx)
    page = get_page(page_id, user_id)
    return demo(page=page) if page else demo(status="unavailable")


@mcp.tool()
def access_inspect(resource: str, ctx: Context) -> dict[str, object]:
    """Найти маршрут доступа к CAT-DEV или buddy-demo."""
    user_id = caller(ctx)
    route = ACCESS.get(resource)
    if route is None:
        return demo(status="unavailable")
    level, source = route
    return demo(
        resource=resource,
        level=level,
        approver="наставник",
        readable=(
            get_page("cat-dev", user_id) is not None if resource == "CAT-DEV" else False
        ),
        source=get_page(source, user_id),
    )


@mcp.tool()
async def access_prepare(
    resource: Annotated[
        Literal["CAT-DEV", "buddy-demo"],
        Field(description="CAT-DEV для базы команды, buddy-demo для репозитория"),
    ],
    justification: Annotated[
        str,
        Field(
            min_length=1, max_length=500, description="Рабочая причина со слов стажёра"
        ),
    ],
    ctx: Context,
) -> dict[str, object]:
    """Подготовить заявку на доступ. Уровень и согласующего выбирает сервис."""
    user_id = caller(ctx)
    info = access_inspect(resource, ctx)
    if info.get("status") == "unavailable" or info["readable"]:
        return info
    justification = justification.strip()
    if not 1 <= len(justification) <= 500:
        return demo(status="invalid_justification")
    payload = dict(
        resource=resource,
        level=info["level"],
        approver=info["approver"],
        justification=justification,
    )
    return demo(
        **await actions(ctx).prepare(user_id, "access", payload), source=info["source"]
    )


@mcp.tool()
async def access_submit(
    action_id: str, version: int, ctx: Context
) -> dict[str, object]:
    """Отправить подтверждённый черновик доступа через демо-сервис."""
    return demo(
        **await actions(ctx).submit(
            caller(ctx, submit=True), "access", action_id, version
        )
    )


@mcp.tool()
async def access_get_request(request_id: str, ctx: Context) -> dict[str, object]:
    """Получить статус своей тестовой заявки на доступ."""
    return demo(**await actions(ctx).get(caller(ctx), "access", request_id))


@mcp.tool()
def pull_request_inspect(pr_number: int, ctx: Context) -> dict[str, object]:
    """Проверить текущий commit и CI для демо-PR 41 или 42."""
    user_id = caller(ctx)
    pr = PULL_REQUESTS.get(pr_number)
    if pr is None:
        return demo(status="unavailable")
    return demo(
        pr_number=pr_number,
        **pr,
        allowed_reviewers=[REVIEWER],
        url=f"https://git.demo.example/buddy-demo/pull/{pr_number}",
        source=get_page("ci" if pr["ci"] == "failed" else "first-pr", user_id),
    )


@mcp.tool()
async def review_prepare(
    pr_number: Annotated[
        int, Field(gt=0, description="Номер PR из ссылки или сообщения")
    ],
    reviewer: Annotated[
        str, Field(description="Логин из allowed_reviewers для этого PR")
    ],
    ctx: Context,
) -> dict[str, object]:
    """Подготовить запрос ревью. Сохраняет текущий commit при успешном CI."""
    user_id = caller(ctx)
    info = pull_request_inspect(pr_number, ctx)
    if info.get("status") == "unavailable":
        return info
    if info["ci"] != "passed" or reviewer not in info["allowed_reviewers"]:
        return demo(status="blocked", pr=info)
    payload = dict(pr_number=pr_number, reviewer=reviewer, commit=info["commit"])
    return demo(
        **await actions(ctx).prepare(user_id, "review", payload), source=info["source"]
    )


@mcp.tool()
async def review_submit(
    action_id: str, version: int, ctx: Context
) -> dict[str, object]:
    """Назначить ревьюера после подтверждения и проверки актуального commit."""
    return demo(
        **await actions(ctx).submit(
            caller(ctx, submit=True), "review", action_id, version
        )
    )


@mcp.tool()
def absence_options(ctx: Context) -> dict[str, object]:
    """Прочитать тестовые правила и доступные типы отсутствия."""
    return demo(
        types=["short_leave"],
        approver="руководитель команды",
        source=get_page("absence", caller(ctx)),
    )


@mcp.tool()
async def absence_prepare(
    start: Annotated[str, Field(description="Начало в ISO 8601 с UTC-смещением")],
    end: Annotated[str, Field(description="Конец в ISO 8601 с UTC-смещением")],
    absence_type: Literal["short_leave"],
    ctx: Context,
) -> dict[str, object]:
    """Подготовить заявку на краткое отсутствие по согласованному со стажёром интервалу."""
    user_id = caller(ctx)
    try:
        start_utc, end_utc = absence_interval(start, end)
    except (ValueError, OverflowError):
        return demo(status="invalid_interval")
    payload = dict(
        start=start_utc,
        end=end_utc,
        absence_type=absence_type,
        approver="руководитель команды",
        requested_start=start,
        requested_end=end,
    )
    return demo(
        **await actions(ctx).prepare(user_id, "absence", payload),
        source=get_page("absence", user_id),
    )


@mcp.tool()
async def absence_submit(
    action_id: str, version: int, ctx: Context
) -> dict[str, object]:
    """Отправить подтверждённый черновик отсутствия через демо-сервис."""
    return demo(
        **await actions(ctx).submit(
            caller(ctx, submit=True), "absence", action_id, version
        )
    )


@mcp.tool()
async def absence_get_request(request_id: str, ctx: Context) -> dict[str, object]:
    """Получить статус своей тестовой заявки на отсутствие."""
    return demo(**await actions(ctx).get(caller(ctx), "absence", request_id))


@mcp.tool()
async def action_get_draft(action_id: str, ctx: Context) -> dict[str, object]:
    """Прочитать сохранённый черновик для отдельного подтверждения."""
    return demo(**await actions(ctx).get_draft(caller(ctx), action_id))


app = mcp.streamable_http_app()
app.router.lifespan_context = lifespan

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=mcp.settings.host, port=mcp.settings.port)
