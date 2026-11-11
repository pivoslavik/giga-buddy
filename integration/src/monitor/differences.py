from __future__ import annotations
from typing import TYPE_CHECKING
from src.monitor.google_drive import list_documents
from src.db import Database, DocumentsRow
from datetime import datetime
from dataclasses import dataclass
from enum import Enum

class DocumentStatus(Enum):
    ADDED = "added"
    DELETED = "deleted"
    MODIFIED = "modified"

@dataclass
class ChangedDocument:
    drive_id:str
    modified_at:datetime
    name:str
    status:DocumentStatus


if TYPE_CHECKING:
    from googleapiclient._apis.drive.v3 import DriveResource

def get_added_and_modified(drive_documents:list[dict],stored_documents:dict) -> list[ChangedDocument]:
    added_and_modified = []
    for document in drive_documents:
        stored = stored_documents.get(document["id"])

        modified_at = datetime.fromisoformat(
            document["modifiedTime"].replace("Z", "+00:00")
        )
        if stored is None :
            changed_document = ChangedDocument(document["id"],modified_at,document["name"],DocumentStatus.ADDED)
            added_and_modified.append(changed_document)

        if stored is not None and stored.source_modified_at != modified_at:
            changed_document = ChangedDocument(document["id"],modified_at,document["name"],DocumentStatus.MODIFIED)
            added_and_modified.append(changed_document)

    return added_and_modified

def get_deleted(drive_documents:list[dict],stored_documents:dict[str,DocumentsRow]) -> list[ChangedDocument]:
    deleted:list[ChangedDocument] = []
    drive_ids = {document["id"] for document in drive_documents}
    for document_id,document in stored_documents.items():
        if document_id not in drive_ids:
            changed_document = ChangedDocument(
                    document.google_document_id,
                    document.source_modified_at,
                    "deleted",
                    DocumentStatus.DELETED
            )
            deleted.append(changed_document)
    return deleted
            
def get_documents_to_process(db:Database,client:DriveResource,folder_id:str) -> list[ChangedDocument]:
    documents_to_process:list[ChangedDocument]= []
    drive_documents = list_documents(client,folder_id)
    stored_documents:dict[str,DocumentsRow] = {document.google_document_id: document for document in db.get_documents_rows()}
    documents_to_process.extend(get_added_and_modified(drive_documents,stored_documents))
    documents_to_process.extend(get_deleted(drive_documents,stored_documents))
    return documents_to_process 
