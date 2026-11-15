from typing import Annotated, Literal

from mcp.server.fastmcp import Context
from pydantic import Field

from ..knowledge import get_page
from ..tool_context import actions, caller, demo


def absence_options(ctx: Context) -> dict[str, object]:
    """Прочитать тестовые правила и доступные типы отсутствия."""
    return demo(
        types=["short_leave"],
        approver="руководитель команды",
        source=get_page("absence", caller(ctx)),
    )


async def absence_prepare(
    start: Annotated[str, Field(description="Начало в ISO 8601 с UTC-смещением")],
    end: Annotated[str, Field(description="Конец в ISO 8601 с UTC-смещением")],
    absence_type: Literal["short_leave"],
    ctx: Context,
) -> dict[str, object]:
    """Подготовить заявку на краткое отсутствие по согласованному со стажёром интервалу."""
    return demo(
        **await actions(ctx).prepare_absence(caller(ctx), start, end, absence_type)
    )


async def absence_submit(
    action_id: str, version: int, ctx: Context
) -> dict[str, object]:
    """Отправить подтверждённый черновик отсутствия через демо-сервис."""
    return demo(
        **await actions(ctx).submit(
            caller(ctx, submit=True), "absence", action_id, version
        )
    )


async def absence_get_request(request_id: str, ctx: Context) -> dict[str, object]:
    """Получить статус своей тестовой заявки на отсутствие."""
    return demo(**await actions(ctx).get(caller(ctx), "absence", request_id))


TOOLS = (
    absence_options,
    absence_prepare,
    absence_submit,
    absence_get_request,
)
