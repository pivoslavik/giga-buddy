from src.db import Database
from src.monitor.differences import ChangedDocument
from pathlib import Path
from src.loader.google_drive import GoogleDocumentLoader
from src.reader import read_document
from src.model.api import ModelAPIManager, ModelResponse
from dataclasses import dataclass
from datetime import datetime
from src.monitor.differences import DocumentStatus
from src.models import DocumentSyncRequest

def get_sync_request(model:ModelAPIManager,
                    loader:GoogleDocumentLoader, 
                    db: Database,
                    documents_dir:Path, 
                    document:ChangedDocument) -> DocumentSyncRequest:
    document_path = documents_dir/document.name
    loader.load_document(document.drive_id,document_path)
    document_text = read_document(document_path)
    model_response:ModelResponse = model.send_prompt(document_text)
    request = DocumentSyncRequest(
            title=model_response.title,
            description=model_response.description,
            text=document_text,
            category=model_response.category,
            google_document_id=document.drive_id,
            source_modified_at=document.modified_at
    )
    return request
    

def sync_added_document(model:ModelAPIManager,
                        loader:GoogleDocumentLoader, 
                        db: Database,
                        documents_dir:Path, 
                        document:ChangedDocument):
    request = get_sync_request(model,loader,db,documents_dir,document)
    db.process_add_request(request)
    # TODO:send a request to ml

def sync_modified_document(model:ModelAPIManager,
                        loader:GoogleDocumentLoader, 
                        db: Database,
                        documents_dir:Path, 
                        document:ChangedDocument):
    request = get_sync_request(model,loader,db,documents_dir,document)
    db.process_modify_request(request)
    # TODO:send a request to ml

def sync_deleted_document(db: Database,document:ChangedDocument):
    db.process_delete_request(document.drive_id)
    

def sync_documents(model:ModelAPIManager,
                   loader:GoogleDocumentLoader,
                   db:Database,
                   documents_dir:Path, 
                   documents:list[ChangedDocument]):
    for document in documents:
        match document.status:
            case DocumentStatus.ADDED:
                sync_added_document(model,loader,db,documents_dir,document)
            case DocumentStatus.MODIFIED:
                sync_modified_document(model,loader,db,documents_dir,document)
            case DocumentStatus.DELETED:
                sync_deleted_document(db,document)
