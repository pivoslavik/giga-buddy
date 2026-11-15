from contextlib import aclosing
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from openai.types.chat.chat_completion_chunk import ChoiceDelta

from ml.src.chat.model_api_manager import (
    ModelAPIError,
    ModelAPIManager,
    build_chat_messages,
)
from ml.src.chat.store import ChatMessage


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def api():
    create = AsyncMock()
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    return ModelAPIManager(client, "test-model"), create


def completion(content=None, *, calls=None):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(message=SimpleNamespace(content=content, tool_calls=calls))
        ]
    )


@pytest.mark.anyio
async def test_generate_reply(api):
    manager, create = api
    messages = build_chat_messages([ChatMessage("user", "Вопрос")], [])
    assert "Подходящих фрагментов нет." in messages[-1]["content"]
    create.return_value = completion("Привет")
    assert await manager.generate_reply(messages) == "Привет"
    create.assert_awaited_once_with(model="test-model", messages=messages)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "response, error",
    [
        (SimpleNamespace(choices=[]), "Missing completion choice"),
        (completion(None), "Invalid completion content"),
        (completion("  "), "Invalid completion content"),
    ],
)
async def test_generate_reply_rejects_invalid_response(api, response, error):
    manager, create = api
    create.return_value = response
    with pytest.raises(ModelAPIError, match=error):
        await manager.generate_reply([])


def chunk(delta, finish_reason=None):
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=delta, finish_reason=finish_reason)]
    )


@pytest.mark.anyio
@pytest.mark.parametrize(
    "chunks, error",
    [
        (
            [
                SimpleNamespace(choices=[]),
                chunk(ChoiceDelta(content="Ответ")),
                chunk(ChoiceDelta(), "stop"),
            ],
            None,
        ),
        ([chunk(ChoiceDelta(content="Ответ"))], "Stream ended before a finish reason"),
        ([chunk(object())], "Invalid streaming delta"),
        ([chunk(ChoiceDelta.model_construct(content=42))], "Invalid streaming content"),
    ],
)
async def test_stream_validates_chunks_and_closes_connection(api, chunks, error):
    manager, create = api
    upstream = MagicMock()
    upstream.__aiter__.return_value = chunks
    create.return_value = upstream
    async with aclosing(manager.stream([])) as stream:
        if error:
            with pytest.raises(ModelAPIError, match=error):
                _ = [part async for part in stream]
        else:
            assert [part async for part in stream] == ["Ответ"]
    create.assert_awaited_once_with(model="test-model", messages=[], stream=True)
    upstream.__aexit__.assert_awaited_once()


def tool_call(name, *, call_type="function"):
    return SimpleNamespace(
        id="call-1", type=call_type, function=SimpleNamespace(name=name, arguments="{}")
    )


def tool_session(*names):
    tools = [
        SimpleNamespace(name=name, description=None, inputSchema={"type": "object"})
        for name in names
    ]
    return SimpleNamespace(
        list_tools=AsyncMock(return_value=SimpleNamespace(tools=tools)),
        call_tool=AsyncMock(),
    )


@pytest.mark.anyio
async def test_tool_selection_filters_tools_and_returns_model_reply(api):
    manager, create = api
    session = tool_session("knowledge_search", "access_submit")
    session.call_tool.return_value = SimpleNamespace(
        isError=False, structuredContent={"pages": ["Инструкция"]}
    )
    create.side_effect = [
        completion(calls=[tool_call("knowledge_search")]),
        completion("Ответ с источником"),
    ]
    messages = [{"role": "system", "content": "System"}]
    assert await manager.collect_tool_results(messages, session) == "Ответ с источником"
    session.call_tool.assert_awaited_once_with("knowledge_search", {})
    tools = create.await_args_list[0].kwargs["tools"]
    assert [tool["function"]["name"] for tool in tools] == ["knowledge_search"]
    assert messages[1]["role"] == "system"
    assert messages[-2]["tool_calls"][0]["id"] == "call-1"
    assert messages[-1] == {
        "role": "tool",
        "tool_call_id": "call-1",
        "content": '{"pages": ["Инструкция"]}',
    }


@pytest.mark.anyio
async def test_no_tools_returns_without_calling_model(api):
    manager, create = api
    assert await manager.collect_tool_results([], tool_session("access_submit")) is None
    create.assert_not_called()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "response, error",
    [
        (SimpleNamespace(choices=[]), "Missing tool selection choice"),
        (
            completion(calls=[tool_call("knowledge_search")] * 5),
            "Invalid tool selection",
        ),
        (
            completion(calls=[tool_call("knowledge_search", call_type="custom")]),
            "Invalid tool selection",
        ),
    ],
)
async def test_invalid_tool_selection(api, response, error):
    manager, create = api
    create.return_value = response
    session = tool_session("knowledge_search")
    with pytest.raises(ModelAPIError, match=error):
        await manager.collect_tool_results([], session)
    session.call_tool.assert_not_called()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "source, expected",
    [
        (None, ""),
        ({"section": "Доступ", "text": "Порядок выдачи"}, "Порядок выдачи"),
        (
            {"section": "Доступ", "url": "https://example.test/docs"},
            "[Доступ](https://example.test/docs)",
        ),
    ],
)
async def test_draft_tool_stops_selection_and_formats_confirmation(
    api, source, expected
):
    manager, create = api
    session = tool_session("access_prepare")
    create.return_value = completion(calls=[tool_call("access_prepare")])
    session.call_tool.return_value = SimpleNamespace(
        isError=False,
        structuredContent={
            "status": "awaiting_confirmation",
            "payload": {
                "resource": "CAT-DEV",
                "level": "read",
                "justification": "Первая\nзадача",
                "approver": "наставник",
            },
            "action_id": "abc",
            "version": 2,
            "source": source,
        },
    )
    reply = await manager.collect_tool_results([], session)
    assert "Тестовый черновик — доступ" in reply
    assert "Первая задача" in reply
    assert "`Подтверждаю abc 2`" in reply
    if expected:
        assert expected in reply
    else:
        assert "Инструкция" not in reply
    create.assert_awaited_once()


@pytest.mark.anyio
async def test_tool_selection_has_a_four_round_limit(api):
    manager, create = api
    create.return_value = completion(calls=[tool_call("knowledge_search")])
    session = tool_session("knowledge_search")
    session.call_tool.return_value = SimpleNamespace(
        isError=False, structuredContent={}
    )
    assert await manager.collect_tool_results([], session) is None
    assert create.await_count == session.call_tool.await_count == 4
