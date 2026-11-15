from typing import Annotated

from mcp.server.fastmcp import Context
from pydantic import Field

from ..actions import inspect_pull_request
from ..tool_context import actions, caller, demo


def pull_request_inspect(pr_number: int, ctx: Context) -> dict[str, object]:
    """Проверить текущий commit и CI для демо-PR 41 или 42."""
    return demo(**inspect_pull_request(caller(ctx), pr_number))


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
    return demo(**await actions(ctx).prepare_review(caller(ctx), pr_number, reviewer))


async def review_submit(
    action_id: str, version: int, ctx: Context
) -> dict[str, object]:
    """Назначить ревьюера после подтверждения и проверки актуального commit."""
    return demo(
        **await actions(ctx).submit(
            caller(ctx, submit=True), "review", action_id, version
        )
    )


async def review_get_status(
    pr_number: Annotated[int, Field(gt=0, description="Номер PR, например 42")],
    ctx: Context,
) -> dict[str, object]:
    """Прочитать сохранённые запросы ревью пользователя и их статусы по номеру PR."""
    return demo(**await actions(ctx).get_review_requests(caller(ctx), pr_number))


TOOLS = (
    pull_request_inspect,
    review_prepare,
    review_submit,
    review_get_status,
)
