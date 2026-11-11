from pathlib import Path

from src.db import Database
from src.loader.google_drive import GoogleDocumentLoader
from src.ml_request import send_ml_request
from src.model.api import ModelAPIManager, ModelResponse
from src.models import DocumentSyncRequest
from src.monitor.differences import ChangedDocument, DocumentStatus
from src.reader import read_document


def get_sync_request(
    model: ModelAPIManager,
    loader: GoogleDocumentLoader,
    db: Database,
    documents_dir: Path,
    document: ChangedDocument,
) -> DocumentSyncRequest:
    document_path = documents_dir / document.name
    loader.load_document(document.drive_id, document_path)
    document_text = read_document(document_path)
    model_response: ModelResponse = model.send_prompt(document_text)
    request = DocumentSyncRequest(
        title=model_response.title,
        description=model_response.description,
        text=document_text,
        category=model_response.category,
        google_document_id=document.drive_id,
        source_modified_at=document.modified_at,
    )
    return request


def sync_added_document(
    model: ModelAPIManager,
    loader: GoogleDocumentLoader,
    db: Database,
    documents_dir: Path,
    document: ChangedDocument,
    ml_url: str,
):
    request = get_sync_request(model, loader, db, documents_dir, document)
    document_id = db.process_add_request(request)
    send_ml_request(ml_url, document_id, document.status)


def sync_modified_document(
    model: ModelAPIManager,
    loader: GoogleDocumentLoader,
    db: Database,
    documents_dir: Path,
    document: ChangedDocument,
    ml_url: str,
):
    request = get_sync_request(model, loader, db, documents_dir, document)
    document_id = db.process_modify_request(request)
    send_ml_request(ml_url, document_id, document.status)


def sync_deleted_document(db: Database, document: ChangedDocument, ml_url: str):
    document_id = db.process_delete_request(document.drive_id)
    send_ml_request(ml_url, document_id, document.status)


def sync_documents(
    model: ModelAPIManager,
    loader: GoogleDocumentLoader,
    db: Database,
    documents_dir: Path,
    documents: list[ChangedDocument],
    ml_url: str,
):
    for document in documents:
        match document.status:
            case DocumentStatus.ADDED:
                sync_added_document(model, loader, db, documents_dir, document, ml_url)
            case DocumentStatus.MODIFIED:
                sync_modified_document(
                    model, loader, db, documents_dir, document, ml_url
                )
            case DocumentStatus.DELETED:
                sync_deleted_document(db, document, ml_url)
