from datetime import UTC, datetime
from unittest.mock import MagicMock, Mock

import pytest
from src.db import Database, DocumentsRow
from src.models import DocumentSyncRequest

MODIFIED_AT = datetime(2026, 1, 2, tzinfo=UTC)


@pytest.fixture
def database(monkeypatch):
    connection = MagicMock()
    connect = Mock(return_value=connection)
    monkeypatch.setattr("src.db.connect", connect)

    db = Database("postgresql://db/integration")
    connect.assert_called_once_with("postgresql://db/integration", autocommit=True)
    cursor = connection.cursor.return_value.__enter__.return_value
    return db, cursor


def test_reads_document_rows_and_closes_connection(database, monkeypatch):
    db, cursor = database
    class_row = Mock()
    monkeypatch.setattr("src.db.class_row", class_row)
    row = DocumentsRow(
        42, "Title", "Summary", "Text", "company", "drive-1", MODIFIED_AT
    )
    cursor.fetchall.return_value = [row]

    assert db.get_documents_rows() == [row]
    class_row.assert_called_once_with(DocumentsRow)
    db.conn.cursor.assert_called_once_with(row_factory=class_row.return_value)
    assert "FROM documents" in cursor.execute.call_args.args[0]
    db.close()
    db.conn.close.assert_called_once_with()


@pytest.mark.parametrize(
    ("method", "statement", "params"),
    [
        (
            "process_add_request",
            "INSERT INTO documents",
            ("Title", "Summary", "Text", "company", "drive-1", MODIFIED_AT),
        ),
        (
            "process_modify_request",
            "UPDATE documents",
            ("Title", "Summary", "Text", "company", MODIFIED_AT, "drive-1"),
        ),
        ("process_delete_request", "DELETE FROM documents", ("drive-1",)),
    ],
)
def test_writes_document_and_returns_id(database, method, statement, params):
    db, cursor = database
    cursor.fetchone.return_value = (42,)
    request = DocumentSyncRequest(
        "Title", "Summary", "Text", "company", "drive-1", MODIFIED_AT
    )
    argument = (
        request if method != "process_delete_request" else request.google_document_id
    )

    assert getattr(db, method)(argument) == 42
    sql, bound_params = cursor.execute.call_args.args
    assert statement in sql
    assert "RETURNING id" in sql
    if method != "process_add_request":
        assert "WHERE google_document_id = %s" in sql
    assert bound_params == params
