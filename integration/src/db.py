from psycopg import connect, cursor
from dataclasses import dataclass
from datetime import datetime
from psycopg.rows import class_row

@dataclass
class DocumentsRow:
    id: int
    title: str
    description: str
    text: str
    category: str
    google_file_id: str 
    source_modified_at: datetime 

class Database:
    def __init__(self,database_url):
        self.conn = connect(database_url,autocommit=True)
    
    def close(self):
        self.conn.close()

    def get_documents_rows(self) -> list[DocumentsRow]:
        with self.conn.cursor(row_factory=class_row(DocumentsRow)) as cur:
            cur.execute(
                """
                SELECT id, title, description, text, category,google_file_id, source_modified_at 
                FROM documents
                """
            )
            return cur.fetchall()
