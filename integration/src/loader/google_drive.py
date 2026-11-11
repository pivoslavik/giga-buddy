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
