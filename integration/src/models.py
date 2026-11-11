from dataclasses import dataclass
from datetime import datetime

@dataclass
class DocumentSyncRequest:
    title: str
    description: str
    text: str
    category: str
    google_document_id: str
    source_modified_at: datetime
