from __future__ import annotations
from typing import TYPE_CHECKING
from src.monitor.google_drive import list_documents
from src.db import Database
from datetime import datetime

if TYPE_CHECKING:
    from googleapiclient._apis.drive.v3 import DriveResource


def get_files_to_process(db:Database,client:DriveResource,folder_id:str) -> list[dict]:
    files_to_process = []
    drive_documents = list_documents(client,folder_id)
    stored_documents = {document.google_file_id: document for document in db.get_documents_rows()}
    for document in drive_documents:
        stored = stored_documents.get(document["id"])

        modified_at = datetime.fromisoformat(
            document["modifiedTime"].replace("Z", "+00:00")
        )
        if stored is not None:
            print("hueta")
        if stored is None or stored.source_modified_at != modified_at:
            files_to_process.append(document)
    # TODO: store pairs: status and document info from drive
    # Maybe also convert dict to class
    return files_to_process
