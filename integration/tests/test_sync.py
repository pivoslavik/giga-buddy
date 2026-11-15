from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import Mock, call

import pytest

from src.db import Database, DocumentsRow
from src.loader import google_drive
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

    downloads = loader.load_document.call_args_list
    assert [download.args[0] for download in downloads] == ["added", "modified"]
    for download in downloads:
        path = download.args[1]
        assert path.parent.parent == tmp_path
        assert not path.parent.exists()
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


@pytest.mark.parametrize("name", ["../outside.txt", "absolute", "linked.txt"])
def test_drive_names_cannot_escape_download_directory(tmp_path, monkeypatch, name):
    documents_dir = tmp_path / "documents"
    documents_dir.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("Original content")
    (documents_dir / "linked.txt").symlink_to(outside)
    if name == "absolute":
        name = str(outside)

    def create_download(file, request):
        assert documents_dir.resolve() in Path(file.name).resolve().parents
        file.write(b"Downloaded text")
        return Mock(next_chunk=Mock(return_value=(None, True)))

    monkeypatch.setattr(google_drive, "MediaIoBaseDownload", create_download)
    model = Mock(
        send_prompt=Mock(return_value=ModelResponse("Title", "Summary", "company"))
    )
    document = ChangedDocument("../untrusted-id", NEW_TIME, name, DocumentStatus.ADDED)

    request = pipeline.get_sync_request(
        model,
        google_drive.GoogleDocumentLoader(Mock()),
        Mock(),
        documents_dir,
        document,
    )

    assert request.text == "Downloaded text"
    assert request.google_document_id == "../untrusted-id"
    assert outside.read_text() == "Original content"
    assert list(documents_dir.iterdir()) == [documents_dir / "linked.txt"]


def test_failed_download_removes_partial_file(tmp_path):
    documents_dir = tmp_path / "documents"

    def download(drive_id, path):
        path.write_text("Partial content")
        raise TimeoutError("Download interrupted")

    loader = Mock(load_document=Mock(side_effect=download))
    model = Mock()
    document = ChangedDocument("file-1", NEW_TIME, "file.txt", DocumentStatus.ADDED)

    with pytest.raises(TimeoutError):
        pipeline.get_sync_request(model, loader, Mock(), documents_dir, document)

    assert list(documents_dir.iterdir()) == []
    model.send_prompt.assert_not_called()
