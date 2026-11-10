from unittest.mock import AsyncMock, MagicMock, Mock

import numpy as np
import pytest
from fastapi.testclient import TestClient
from psycopg import IntegrityError, OperationalError
from psycopg_pool import PoolTimeout

from ml.src import main
from ml.src.features.documents import embeddings


@pytest.fixture
def indexing(monkeypatch):
    document = "Existing text."
    pool = MagicMock()
    pool.wait = AsyncMock()
    connection = MagicMock()
    pool.connection.return_value.__aenter__.return_value = connection
    connection.execute = AsyncMock()
    connection.execute.return_value.fetchone = AsyncMock(return_value=(document,))
    cursor = MagicMock()
    connection.cursor.return_value.__aenter__.return_value = cursor
    cursor.execute = AsyncMock()
    cursor.executemany = AsyncMock()
    model = Mock()
    model.encode.return_value = np.ones((1, 384), dtype=np.float32)
    loader = Mock(return_value=model)

    monkeypatch.setenv("DATABASE_URL", "test-dsn")
    monkeypatch.setattr(main, "AsyncConnectionPool", Mock(return_value=pool))
    monkeypatch.setattr(embeddings, "load_model", loader)
    with TestClient(main.app) as client:
        yield client, connection, cursor, model, loader

    pool.wait.assert_awaited_once()
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
    client, connection, _, model, _ = indexing
    assert client.post("/documents", json=payload).status_code == 422
    connection.execute.assert_not_called()
    model.encode.assert_not_called()


@pytest.mark.parametrize(("row", "status"), [(None, 404), ((" 	",), 422)])
def test_missing_or_empty_document(indexing, row, status):
    client, connection, cursor, model, _ = indexing
    connection.execute.return_value.fetchone.return_value = row
    assert client.post("/documents", json={"document_id": 42}).status_code == status
    model.encode.assert_not_called()
    cursor.execute.assert_not_called()


def test_indexing_replaces_chunks_using_document_id(indexing):
    client, connection, cursor, model, loader = indexing
    for _ in range(2):
        response = client.post("/documents", json={"document_id": 42})
        assert response.status_code == 200
        assert response.json() == {"id": 42, "chunk_count": 1}

    assert loader.call_count == 1
    assert model.encode.call_count == 2
    assert connection.execute.await_args.args == (
        "SELECT text FROM documents WHERE id = %s FOR UPDATE",
        (42,),
    )
    assert connection.transaction.return_value.__aexit__.await_count == 2
    for delete, insert in zip(
        cursor.execute.await_args_list, cursor.executemany.await_args_list, strict=True
    ):
        assert delete.args == (
            "DELETE FROM document_chunks WHERE document_id = %s",
            (42,),
        )
        query, rows = insert.args
        assert "INSERT INTO document_chunks" in query
        [(document_id, content, vector, index)] = rows
        assert (document_id, content, index) == (42, "Existing text.", 0)
        assert vector.shape == (384,)


@pytest.mark.parametrize(("latest_row", "status"), [(None, 404), (("Changed",), 409)])
def test_document_changed_before_write(indexing, latest_row, status):
    client, connection, cursor, _, _ = indexing
    connection.execute.return_value.fetchone.side_effect = [("Original",), latest_row]
    assert client.post("/documents", json={"document_id": 42}).status_code == status
    cursor.execute.assert_not_called()


@pytest.mark.parametrize("error", [OperationalError, PoolTimeout])
def test_unavailable_database(indexing, error):
    client, connection, _, _, _ = indexing
    connection.execute.side_effect = error
    assert client.post("/documents", json={"document_id": 42}).status_code == 503


def test_insert_failure_rolls_back(indexing):
    client, connection, cursor, _, _ = indexing
    cursor.executemany.side_effect = IntegrityError
    assert client.post("/documents", json={"document_id": 42}).status_code == 500
    cursor.execute.assert_awaited_once()
    assert (
        connection.transaction.return_value.__aexit__.await_args.args[0]
        is IntegrityError
    )


def test_failed_inference_keeps_existing_chunks(indexing):
    client, connection, cursor, model, _ = indexing
    model.encode.side_effect = RuntimeError
    assert client.post("/documents", json={"document_id": 42}).status_code == 500
    connection.transaction.assert_not_called()
    cursor.execute.assert_not_called()
