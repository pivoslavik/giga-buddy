import json
from types import SimpleNamespace
from unittest.mock import Mock, call

import pytest
from requests.exceptions import HTTPError
from src import client, ml_request
from src.loader import google_drive as loader
from src.model import api
from src.model.prompt import SYSTEM_PROMPT
from src.monitor.differences import DocumentStatus
from src.monitor.google_drive import list_documents
from src.reader import read_document


def test_creates_drive_client_with_read_only_access(monkeypatch):
    load_credentials = Mock()
    build = Mock()
    monkeypatch.setattr(
        client.service_account.Credentials,
        "from_service_account_file",
        load_credentials,
    )
    monkeypatch.setattr(client, "build", build)

    assert client.create_client("credentials.json") is build.return_value
    load_credentials.assert_called_once_with(
        "credentials.json", scopes=["https://www.googleapis.com/auth/drive.readonly"]
    )
    build.assert_called_once_with(
        "drive", "v3", credentials=load_credentials.return_value
    )


def test_lists_all_drive_pages():
    drive = Mock()
    list_files = drive.files.return_value.list
    list_files.return_value.execute.side_effect = [
        {"files": [{"id": "first"}], "nextPageToken": "second-page"},
        {"nextPageToken": "third-page"},
        {"files": [{"id": "last"}]},
    ]

    assert list_documents(drive, "folder") == [{"id": "first"}, {"id": "last"}]
    assert list_files.call_args_list == [
        call(
            q="'folder' in parents and trashed = false",
            fields="nextPageToken, files(id, name, mimeType, modifiedTime)",
            pageSize=1000,
            pageToken=token,
        )
        for token in (None, "second-page", "third-page")
    ]


def test_download_writes_all_chunks_to_new_directory(monkeypatch, tmp_path):
    drive = Mock()
    downloader = Mock()

    def create_download(file, request):
        assert request is drive.files.return_value.get_media.return_value
        chunks = iter([(b"first ", False), (b"second", True)])

        def next_chunk():
            chunk, done = next(chunks)
            file.write(chunk)
            return None, done

        downloader.next_chunk.side_effect = next_chunk
        return downloader

    monkeypatch.setattr(loader, "MediaIoBaseDownload", create_download)
    path = tmp_path / "drive" / "document.txt"

    loader.GoogleDocumentLoader(drive).load_document("file-1", path)

    drive.files.return_value.get_media.assert_called_once_with(fileId="file-1")
    assert path.read_bytes() == b"first second"


@pytest.mark.parametrize("name", [".", "missing.txt"])
def test_reader_rejects_non_files(tmp_path, name):
    with pytest.raises(ValueError, match="path is not a file"):
        read_document(tmp_path / name)


def test_model_sends_prompt_and_parses_metadata(monkeypatch):
    openai = Mock()
    monkeypatch.setattr(api, "OpenAI", openai)
    manager = api.ModelAPIManager("api-key", "https://model.example", "chat-model")
    create = openai.return_value.chat.completions.create
    content = json.dumps(
        {"title": "Заголовок", "description": "Описание", "category": "company"}
    )
    create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )

    assert manager.send_prompt("Текст") == api.ModelResponse(
        "Заголовок", "Описание", "company"
    )
    openai.assert_called_once_with(api_key="api-key", base_url="https://model.example")
    create.assert_called_once_with(
        model="chat-model",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "Текст"},
        ],
        response_format={"type": "json_object"},
    )


def test_ml_retries_failed_notification(monkeypatch):
    post = Mock()
    post.return_value.raise_for_status.side_effect = [HTTPError("503"), None]
    sleep = Mock()
    monkeypatch.setattr(ml_request.requests, "post", post)
    monkeypatch.setattr(ml_request, "sleep", sleep)

    ml_request.send_ml_request("http://ml", 42, DocumentStatus.MODIFIED)

    assert (
        post.call_args_list
        == [
            call(
                "http://ml/documents",
                json={"document_id": 42, "status": "modified"},
                timeout=10,
            )
        ]
        * 2
    )
    assert post.return_value.raise_for_status.call_count == 2
    sleep.assert_called_once_with(5)
