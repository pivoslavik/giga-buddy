from dataclasses import dataclass
from datetime import datetime

from psycopg import connect
from psycopg.rows import class_row

from src.models import DocumentSyncRequest


@dataclass
class DocumentsRow:
    id: int
    title: str
    description: str
    text: str
    category: str
    google_document_id: str
    source_modified_at: datetime


class Database:
    def __init__(self, database_url):
        self.conn = connect(database_url, autocommit=True)

    def close(self):
        self.conn.close()

    def get_documents_rows(self) -> list[DocumentsRow]:
        with self.conn.cursor(row_factory=class_row(DocumentsRow)) as cur:
            cur.execute("""
                SELECT id, title, description, text, category,google_document_id, source_modified_at 
                FROM documents
                """)
            return cur.fetchall()

    def process_add_request(self, request: DocumentSyncRequest) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                    INSERT INTO documents (title,description,text,category,google_document_id,source_modified_at)
                    VALUES (%s,%s,%s,%s,%s,%s)
                    RETURNING id
                    """,
                (
                    request.title,
                    request.description,
                    request.text,
                    request.category,
                    request.google_document_id,
                    request.source_modified_at,
                ),
            )
            row = cur.fetchone()
            assert row is not None
            return row[0]

    def process_modify_request(self, request: DocumentSyncRequest) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                    UPDATE documents
                    SET title = %s,
                    description = %s,
                    text = %s,
                    category = %s,
                    source_modified_at = %s
                    WHERE google_document_id = %s
                    RETURNING id
                    """,
                (
                    request.title,
                    request.description,
                    request.text,
                    request.category,
                    request.source_modified_at,
                    request.google_document_id,
                ),
            )
            row = cur.fetchone()
            assert row is not None
            return row[0]

    def process_delete_request(self, drive_id: str) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                    DELETE FROM documents WHERE google_document_id = %s
                    RETURNING id
                    """,
                (drive_id,),
            )
            row = cur.fetchone()
            assert row is not None
            return row[0]
