from __future__ import annotations
from pathlib import Path
from googleapiclient.http import MediaIoBaseDownload

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from googleapiclient._apis.drive.v3 import DriveResource

class GoogleDocumentLoader:
    def __init__(self,client:DriveResource):
        self.client = client
    
    def load_document(self,file_id:str,storage_path:Path):
        request = self.client.files().get_media(fileId=file_id)
        storage_path.parent.mkdir(parents=True, exist_ok=True)
        with storage_path.open("wb") as file:
            downloader = MediaIoBaseDownload(file,request)
            done = False
            while not done:
                _,done = downloader.next_chunk()
    
    def list_files(self, folder_id: str):
        files = []
        page_token = None

        while True:
            response = self.client.files().list(
                q=f"'{folder_id}' in parents and trashed = false",
                fields="nextPageToken, files(id, name, mimeType, modifiedTime)",
                pageSize=1000,
                pageToken=page_token,
            ).execute()

            files.extend(response.get("files", []))

            page_token = response.get("nextPageToken")
            if not page_token:
                break

        return files
        
