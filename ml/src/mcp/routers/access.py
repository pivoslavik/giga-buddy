from typing import Annotated, Literal

from mcp.server.fastmcp import Context
from pydantic import Field

from ..actions import inspect_access
from ..tool_context import actions, caller, demo


def access_inspect(resource: str, ctx: Context) -> dict[str, object]:
    """Найти маршрут доступа к CAT-DEV или buddy-demo."""
    return demo(**inspect_access(caller(ctx), resource))


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
    return demo(
        **await actions(ctx).prepare_access(caller(ctx), resource, justification)
    )


async def access_submit(
    action_id: str, version: int, ctx: Context
) -> dict[str, object]:
    """Отправить подтверждённый черновик доступа через демо-сервис."""
    return demo(
        **await actions(ctx).submit(
            caller(ctx, submit=True), "access", action_id, version
        )
    )


async def access_get_request(request_id: str, ctx: Context) -> dict[str, object]:
    """Получить статус своей тестовой заявки на доступ."""
    return demo(**await actions(ctx).get(caller(ctx), "access", request_id))


TOOLS = (
    access_inspect,
    access_prepare,
    access_submit,
    access_get_request,
)
