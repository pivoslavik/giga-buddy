from unittest.mock import AsyncMock, MagicMock, Mock

import asyncpg
import numpy as np
import pytest
from fastapi.testclient import TestClient

from ml.src import main
from ml.src.documents import embeddings


@pytest.fixture
def indexing(monkeypatch):
    pool = MagicMock()
    pool.__aenter__.return_value = pool
    connection = MagicMock()
    pool.acquire.return_value.__aenter__.return_value = connection
    connection.fetchval = AsyncMock(return_value="Existing text.")
    connection.execute = AsyncMock()
    connection.executemany = AsyncMock()
    model = Mock()
    model.encode.return_value = np.ones((1, 384), dtype=np.float32)
    loader = Mock(return_value=model)

    monkeypatch.setenv("DATABASE_URL", "test-dsn")
    monkeypatch.setenv("ML_INFERENCE_MAX_WAITING", "2")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://example.test")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_CHAT_MODEL", "test-model")
    model_api = Mock(generate_reply=AsyncMock(return_value="Answer"))
    monkeypatch.setattr(main, "ModelAPIManager", Mock(return_value=model_api))
    create_pool = Mock(return_value=pool)
    monkeypatch.setattr(main.asyncpg, "create_pool", create_pool)
    monkeypatch.setattr(embeddings, "load_model", loader)
    with TestClient(main.app) as client:
        yield client, connection, model, loader

    create_pool.assert_called_once_with(
        "test-dsn",
        min_size=1,
        max_size=4,
        timeout=10,
        command_timeout=30,
        init=main.register_vector,
    )
    pool.__aenter__.assert_awaited_once()
    pool.__aexit__.assert_awaited_once()
    loader.assert_called_once()


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"document_id": 0},
        {"document_id": -1},
        {"document_id": "42"},
        {"document_id": True},
        {"document_id": 2**63},
        {"document_id": 42, "text": "extra"},
    ],
)
def test_invalid_document_id(indexing, payload):
    client, connection, model, _ = indexing
    assert (
        client.post("/documents", json={"status": "added", **payload}).status_code
        == 422
    )
    connection.fetchval.assert_not_called()
    model.encode.assert_not_called()


@pytest.mark.parametrize("status_fields", [{}, {"status": "unknown"}])
def test_missing_or_invalid_document_status(indexing, status_fields):
    client, connection, model, _ = indexing
    response = client.post("/documents", json={"document_id": 42, **status_fields})
    assert response.status_code == 422
    connection.fetchval.assert_not_awaited()
    model.encode.assert_not_called()


def test_deleted_removes_only_chunks_and_can_be_retried(indexing):
    client, connection, model, _ = indexing
    for _ in range(2):
        response = client.post(
            "/documents", json={"document_id": 42, "status": "deleted"}
        )
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    assert [call.args for call in connection.execute.await_args_list] == [
        ("DELETE FROM document_chunks WHERE document_id = $1", 42),
        ("DELETE FROM document_chunks WHERE document_id = $1", 42),
    ]
    connection.fetchval.assert_not_awaited()
    connection.executemany.assert_not_awaited()
    model.encode.assert_not_called()


@pytest.mark.parametrize(("row", "status"), [(None, 404), (" \t", 422)])
def test_missing_or_empty_document(indexing, row, status):
    client, connection, model, _ = indexing
    connection.fetchval.return_value = row
    assert (
        client.post(
            "/documents", json={"document_id": 42, "status": "modified"}
        ).status_code
        == status
    )
    model.encode.assert_not_called()
    connection.execute.assert_not_called()


@pytest.mark.parametrize("operation", ["added", "modified"])
def test_indexing_replaces_chunks_using_document_id(indexing, operation):
    client, connection, model, loader = indexing
    for _ in range(2):
        response = client.post(
            "/documents", json={"document_id": 42, "status": operation}
        )
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    assert loader.call_count == 1
    assert model.encode.call_count == 2
    assert connection.fetchval.await_args.args == (
        "SELECT text FROM documents WHERE id = $1 FOR UPDATE",
        42,
    )
    assert connection.transaction.return_value.__aexit__.await_count == 2
    for delete, insert in zip(
        connection.execute.await_args_list,
        connection.executemany.await_args_list,
        strict=True,
    ):
        assert delete.args == (
            "DELETE FROM document_chunks WHERE document_id = $1",
            42,
        )
        query, rows = insert.args
        assert "INSERT INTO document_chunks" in query
        [(document_id, content, vector, index)] = rows
        assert (document_id, content, index) == (42, "Existing text.", 0)
        assert vector.shape == (384,)


@pytest.mark.parametrize(("latest_row", "status"), [(None, 404), ("Changed", 409)])
def test_document_changed_before_write(indexing, latest_row, status):
    client, connection, _, _ = indexing
    connection.fetchval.side_effect = ["Original", latest_row]
    assert (
        client.post(
            "/documents", json={"document_id": 42, "status": "modified"}
        ).status_code
        == status
    )
    connection.execute.assert_not_called()


@pytest.mark.parametrize(
    "error", [asyncpg.ConnectionDoesNotExistError, TimeoutError, ConnectionRefusedError]
)
def test_unavailable_database(indexing, error):
    client, connection, _, _ = indexing
    connection.fetchval.side_effect = error
    assert (
        client.post(
            "/documents", json={"document_id": 42, "status": "modified"}
        ).status_code
        == 503
    )


def test_insert_failure_rolls_back(indexing):
    client, connection, _, _ = indexing
    connection.executemany.side_effect = asyncpg.UniqueViolationError
    assert (
        client.post(
            "/documents", json={"document_id": 42, "status": "modified"}
        ).status_code
        == 500
    )
    connection.execute.assert_awaited_once()
    assert (
        connection.transaction.return_value.__aexit__.await_args.args[0]
        is asyncpg.UniqueViolationError
    )


def test_failed_inference_keeps_existing_chunks(indexing):
    client, connection, model, _ = indexing
    model.encode.side_effect = RuntimeError
    assert (
        client.post(
            "/documents", json={"document_id": 42, "status": "modified"}
        ).status_code
        == 500
    )
    connection.transaction.assert_not_called()
    connection.execute.assert_not_called()


def test_inference_overload_returns_503(indexing, monkeypatch):
    client, connection, _, _ = indexing
    encode = AsyncMock(side_effect=embeddings.InferenceUnavailable)
    monkeypatch.setattr(embeddings.Embeddings, "encode", encode)
    response = client.post("/documents", json={"document_id": 42, "status": "modified"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Embedding inference is busy"}
    connection.transaction.assert_not_called()


@pytest.mark.parametrize("stream", [False, True])
def test_chat_uses_requested_message_and_shared_model(indexing, stream):
    client, _, model, loader = indexing
    app = client.app
    service = app.state.chat_service
    pool = service.store.pool
    pool.fetch = AsyncMock(
        side_effect=[
            [],
            [
                {"role": "user", "text": "Earlier message"},
                {"role": "assistant", "text": "Previous answer"},
                {"role": "user", "text": "First question"},
            ],
            [{"id": 7, "content": "Relevant document"}],
        ]
    )

    async def stream_answer(messages):
        yield "Answer"

    service.model_api.stream = Mock(side_effect=stream_answer)
    payload = {"user_id": 3, "message_id": 12, "stream": stream}
    assert client.post("/analyze", json=payload).status_code == 404
    model.encode.assert_not_called()
    assert client.post("/documents", json={"document_id": 42}).status_code == 200
    response = client.post("/analyze", json=payload)
    if stream:
        assert response.headers["content-type"].startswith("text/event-stream")
        assert 'event: token\ndata: {"delta": "Answer"}' in response.text
        assert 'event: done\ndata: {"response": "Answer"}' in response.text
        messages = service.model_api.stream.call_args.args[0]
    else:
        assert response.json() == {"response": "Answer"}
        messages = service.model_api.generate_reply.await_args.args[0]

    for call in pool.fetch.await_args_list[:2]:
        sql, user_id, message_id = call.args
        assert "user_id = $1 AND id = $2" in sql
        assert "id <= $2" in sql
        assert "LIMIT 20" in sql
        assert (user_id, message_id) == (3, 12)
    loader.assert_called_once()
    assert model.encode.call_args_list[0].args == (["passage: Existing text."],)
    assert model.encode.call_args_list[1].args == (["query: Earlier message"],)
    assert messages[1:3] == [
        {"role": "user", "content": "First question"},
        {"role": "assistant", "content": "Previous answer"},
    ]
    assert messages[-1]["role"] == "user"
    assert "[7] Relevant document" in messages[-1]["content"]
    assert messages[-1]["content"].endswith("Earlier message")
