from datetime import UTC, datetime
from unittest.mock import Mock, call

from src.db import Database, DocumentsRow
from src.model.api import ModelAPIManager, ModelResponse
from src.models import DocumentSyncRequest
from src.monitor.differences import (
    ChangedDocument,
    DocumentStatus,
    get_documents_to_process,
)
from src.sync import pipeline

OLD_TIME = datetime(2026, 1, 1, tzinfo=UTC)
NEW_TIME = datetime(2026, 1, 2, tzinfo=UTC)


def test_detects_added_modified_and_deleted_documents(monkeypatch):
    db = Mock(spec=Database)
    db.get_documents_rows.return_value = [
        DocumentsRow(1, "Title", "Summary", "Text", "company", "modified", OLD_TIME),
        DocumentsRow(2, "Title", "Summary", "Text", "company", "deleted", OLD_TIME),
        DocumentsRow(3, "Title", "Summary", "Text", "company", "unchanged", NEW_TIME),
    ]
    client = Mock()
    list_documents = Mock(
        return_value=[
            {"id": "added", "name": "new.txt", "modifiedTime": "2026-01-02T00:00:00Z"},
            {
                "id": "modified",
                "name": "updated.txt",
                "modifiedTime": "2026-01-02T00:00:00Z",
            },
            {
                "id": "unchanged",
                "name": "same.txt",
                "modifiedTime": "2026-01-02T03:00:00+03:00",
            },
        ]
    )
    monkeypatch.setattr("src.monitor.differences.list_documents", list_documents)

    assert get_documents_to_process(db, client, "folder-1") == [
        ChangedDocument("added", NEW_TIME, "new.txt", DocumentStatus.ADDED),
        ChangedDocument("modified", NEW_TIME, "updated.txt", DocumentStatus.MODIFIED),
        ChangedDocument("deleted", OLD_TIME, "deleted", DocumentStatus.DELETED),
    ]
    list_documents.assert_called_once_with(client, "folder-1")


def test_sync_writes_changes_and_notifies_ml(tmp_path, monkeypatch):
    def download(drive_id, path):
        path.write_text(f"Text for {drive_id}")

    loader = Mock()
    loader.load_document.side_effect = download
    model = Mock(spec=ModelAPIManager)
    model.send_prompt.side_effect = [
        ModelResponse("New title", "New summary", "company"),
        ModelResponse("Updated title", "Updated summary", "development"),
    ]
    db = Mock(spec=Database)
    db.process_add_request.return_value = 11
    db.process_modify_request.return_value = 12
    db.process_delete_request.return_value = 13
    notify = Mock()
    operations = Mock()
    operations.attach_mock(db, "db")
    operations.attach_mock(notify, "notify")
    monkeypatch.setattr(pipeline, "send_ml_request", notify)

    documents = [
        ChangedDocument("added", NEW_TIME, "new.txt", DocumentStatus.ADDED),
        ChangedDocument("modified", NEW_TIME, "updated.txt", DocumentStatus.MODIFIED),
        ChangedDocument("deleted", OLD_TIME, "deleted", DocumentStatus.DELETED),
    ]
    pipeline.sync_documents(model, loader, db, tmp_path, documents, "http://ml")

    assert loader.load_document.call_args_list == [
        call("added", tmp_path / "new.txt"),
        call("modified", tmp_path / "updated.txt"),
    ]
    assert model.send_prompt.call_args_list == [
        call("Text for added"),
        call("Text for modified"),
    ]
    assert operations.mock_calls == [
        call.db.process_add_request(
            DocumentSyncRequest(
                "New title",
                "New summary",
                "Text for added",
                "company",
                "added",
                NEW_TIME,
            )
        ),
        call.notify("http://ml", 11, DocumentStatus.ADDED),
        call.db.process_modify_request(
            DocumentSyncRequest(
                "Updated title",
                "Updated summary",
                "Text for modified",
                "development",
                "modified",
                NEW_TIME,
            )
        ),
        call.notify("http://ml", 12, DocumentStatus.MODIFIED),
        call.db.process_delete_request("deleted"),
        call.notify("http://ml", 13, DocumentStatus.DELETED),
    ]
