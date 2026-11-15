import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ml.src.chat import router
from ml.src.chat.model_api_manager import ModelAPIError
from ml.src.chat.service import ChatService, EmptyMessage, MessageNotFound
from ml.src.chat.store import ChatMessage, ChatStore, DatabaseError
from ml.src.documents.embeddings import EmbeddingError, InferenceUnavailable


@pytest.fixture
def chat():
    pool = SimpleNamespace(fetch=AsyncMock())
    embeddings = SimpleNamespace(encode=AsyncMock(return_value=[[0.5]]))
    model = MagicMock(generate_reply=AsyncMock(return_value="Ответ"))
    service = ChatService(
        ChatStore(pool),
        embeddings,
        model,
        messages_to_context=3,
        documents_to_context=2,
    )
    pool.fetch.side_effect = [
        [
            {"role": "user", "text": "Вопрос"},
            {"role": "assistant", "text": "Привет"},
            {"role": "user", "text": "Начало"},
        ],
        [{"id": 15, "content": "Инструкция"}],
    ]
    return service, pool, embeddings, model


def test_reply_uses_ordered_history_and_relevant_chunks(chat):
    service, pool, embeddings, model = chat
    assert asyncio.run(service.generate_reply(7, 20)) == "Ответ"
    embeddings.encode.assert_awaited_once_with(["Вопрос"], prefix="query")
    history_call, chunks_call = pool.fetch.await_args_list
    assert history_call.args[1:] == (7, 20, 3)
    assert chunks_call.args[1:] == ([0.5], 2)
    messages = model.generate_reply.await_args.args[0]
    assert [message["role"] for message in messages] == [
        "system",
        "user",
        "assistant",
        "user",
    ]
    assert messages[1]["content"] == "Начало"
    assert messages[2]["content"] == "Привет"
    assert messages[-1]["content"].endswith(
        "[15] Инструкция\n\nВопрос пользователя:\nВопрос"
    )


@pytest.mark.parametrize("query", ["history", "chunks"])
def test_chat_store_wraps_database_errors(query):
    store = ChatStore(SimpleNamespace(fetch=AsyncMock(side_effect=TimeoutError)))
    request = (
        store.get_history(7, 20, limit=3)
        if query == "history"
        else store.find_relevant_chunks([0.5], limit=2)
    )
    with pytest.raises(DatabaseError) as error:
        asyncio.run(request)
    assert isinstance(error.value.__cause__, TimeoutError)


@pytest.mark.parametrize(
    "history, error",
    [([], MessageNotFound), ([ChatMessage("user", " ")], EmptyMessage)],
)
def test_reply_requires_nonempty_user_message(chat, history, error):
    service, _, embeddings, model = chat
    service.store = SimpleNamespace(get_history=AsyncMock(return_value=history))
    with pytest.raises(error):
        asyncio.run(service.generate_reply(7, 20))
    embeddings.encode.assert_not_called()
    model.generate_reply.assert_not_called()


@pytest.mark.parametrize(
    "status, text",
    [
        ("approved", "уже согласована"),
        ("pending_approval", "Ожидает согласования"),
        ("review_requested", "Ревью запрошено"),
        ("overlap", "Интервал пересекается"),
        ("unexpected", "Не удалось проверить результат"),
    ],
)
def test_confirmed_draft_bypasses_model(chat, status, text):
    service, _, embeddings, model = chat
    service.store = SimpleNamespace(
        get_history=AsyncMock(
            return_value=[ChatMessage("user", f"Подтверждаю {'A' * 32} 2")]
        )
    )
    submit = AsyncMock(return_value={"status": status, "request_id": "REQ-42"})
    service.buddy_mcp = SimpleNamespace(submit_draft=submit)
    assert text in asyncio.run(service.generate_reply(7, 20))
    submit.assert_awaited_once_with(7, "a" * 32, 2)
    embeddings.encode.assert_not_called()
    model.generate_reply.assert_not_called()


@pytest.mark.parametrize(
    "status, text",
    [
        ("approved", "согласована"),
        ("unavailable", "недоступна"),
        ("failed", "Не удалось"),
    ],
)
def test_demo_approval_normalizes_request_id(chat, status, text):
    service, _, embeddings, _ = chat
    service.store = SimpleNamespace(
        get_history=AsyncMock(
            return_value=[ChatMessage("user", f"демо согласовать acc-{'B' * 32}")]
        )
    )
    approve = AsyncMock(return_value={"status": status})
    service.buddy_mcp = SimpleNamespace(approve_demo_access=approve)
    assert text in asyncio.run(service.generate_reply(7, 20))
    approve.assert_awaited_once_with(7, "ACC-" + "b" * 32)
    embeddings.encode.assert_not_called()


@pytest.mark.parametrize("reply", ["Черновик", None])
def test_stream_uses_tool_reply_or_model(chat, reply):
    service, _, _, model = chat
    session = object()
    service.buddy_mcp = MagicMock()
    service.buddy_mcp.connect.return_value.__aenter__.return_value = session
    model.collect_tool_results = AsyncMock(return_value=reply)

    async def stream(_):
        yield "Часть"
        yield " ответа"

    model.stream.side_effect = stream

    async def run():
        return [delta async for delta in await service.stream_reply(7, 20)]

    assert asyncio.run(run()) == ([reply] if reply else ["Часть", " ответа"])
    service.buddy_mcp.connect.assert_called_once_with(7)
    assert model.collect_tool_results.await_args.args[1] is session
    assert model.stream.call_count == (0 if reply else 1)


def test_upstream_errors_are_translated(chat):
    service, _, _, model = chat
    model.generate_reply.side_effect = TimeoutError
    with pytest.raises(ModelAPIError, match="Model API request failed"):
        asyncio.run(service.generate_reply(7, 20))


@pytest.fixture
def api():
    app = FastAPI()
    app.include_router(router.router)
    service = SimpleNamespace(generate_reply=AsyncMock(), stream_reply=AsyncMock())
    app.state.chat_service = service
    return TestClient(app), service


@pytest.mark.parametrize(
    "error, status, detail",
    [
        (MessageNotFound, 404, "Message not found"),
        (EmptyMessage, 422, "Message is empty"),
        (DatabaseError, 503, "Database unavailable"),
        (InferenceUnavailable, 503, "Embedding inference is busy"),
        (EmbeddingError, 503, "Embedding model unavailable"),
        (ModelAPIError, 502, "Model API request failed"),
    ],
)
def test_analyze_maps_service_errors(api, error, status, detail):
    client, service = api
    service.generate_reply.side_effect = error
    response = client.post("/analyze", json={"user_id": 7, "message_id": 20})
    assert response.status_code == status
    assert response.json() == {"detail": detail}


def test_analyze_returns_json_and_handles_missing_model(api):
    client, service = api
    service.generate_reply.return_value = "Ответ"
    payload = {"user_id": 7, "message_id": 20}
    response = client.post("/analyze", json=payload)
    assert response.json() == {"response": "Ответ"}
    service.generate_reply.assert_awaited_once_with(7, 20)
    assert client.post("/analyze", json={**payload, "user_id": True}).status_code == 422
    client.app.state.chat_service = None
    assert client.post("/analyze", json=payload).status_code == 503


@pytest.mark.parametrize("mode", ["success", "empty", "failure"])
def test_analyze_stream_delivers_sse_and_closes_generator(api, mode):
    client, service = api
    closed = MagicMock()

    async def stream():
        try:
            if mode != "empty":
                yield "Ответ"
            if mode == "failure":
                raise ModelAPIError("upstream")
        finally:
            closed()

    service.stream_reply.return_value = stream()
    response = client.post(
        "/analyze",
        headers={"Accept": "text/event-stream"},
        json={"user_id": 7, "message_id": 20},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = response.text.strip().split("\n\n")
    expected = [] if mode == "empty" else ['event: token\ndata: {"delta": "Ответ"}']
    if mode == "success":
        expected.append('event: done\ndata: {"response": "Ответ"}')
    else:
        expected.append('event: error\ndata: {"detail": "Model API request failed"}')
    assert events == expected
    closed.assert_called_once()
