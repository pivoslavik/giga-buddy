import runpy
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import Mock, call

import pytest
from src.monitor.differences import ChangedDocument, DocumentStatus


def test_main_syncs_changes_and_waits_between_polls(monkeypatch):
    env = {
        "GOOGLE_DRIVE_CREDENTIALS": "credentials.json",
        "FOLDER_ID": "folder",
        "OPENAI_BASE_URL": "https://model.example",
        "OPENAI_API_KEY": "api-key",
        "OPENAI_CHAT_MODEL": "chat-model",
        "DB_URL": "postgresql://db/integration",
        "ML_URL": "http://ml",
    }
    for name, value in env.items():
        monkeypatch.setenv(name, value)

    class StopPolling(Exception):
        pass

    documents = [
        ChangedDocument(
            "drive-1",
            datetime(2026, 1, 2, tzinfo=UTC),
            "document.txt",
            DocumentStatus.ADDED,
        )
    ]
    create_client = Mock()
    create_loader = Mock()
    create_model = Mock()
    create_db = Mock()
    poll = Mock(side_effect=[[], documents])
    sync = Mock()
    sleep = Mock(side_effect=[None, StopPolling])
    monkeypatch.setattr("dotenv.load_dotenv", Mock())
    monkeypatch.setattr("src.client.create_client", create_client)
    monkeypatch.setattr("src.loader.google_drive.GoogleDocumentLoader", create_loader)
    monkeypatch.setattr("src.model.api.ModelAPIManager", create_model)
    monkeypatch.setattr("src.db.Database", create_db)
    monkeypatch.setattr("src.monitor.differences.get_documents_to_process", poll)
    monkeypatch.setattr("src.sync.pipeline.sync_documents", sync)
    monkeypatch.setattr("time.sleep", sleep)

    with pytest.raises(StopPolling):
        runpy.run_module("src.main", run_name="__main__")

    create_client.assert_called_once_with("credentials.json")
    create_loader.assert_called_once_with(create_client.return_value)
    create_model.assert_called_once_with(
        "api-key", "https://model.example", "chat-model"
    )
    create_db.assert_called_once_with("postgresql://db/integration")
    assert (
        poll.call_args_list
        == [call(create_db.return_value, create_client.return_value, "folder")] * 2
    )
    sync.assert_called_once_with(
        create_model.return_value,
        create_loader.return_value,
        create_db.return_value,
        Path("documents"),
        documents,
        "http://ml",
    )
    assert sleep.call_args_list == [call(30), call(30)]
