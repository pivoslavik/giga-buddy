import os
from typing import Annotated, Literal

import psycopg
from fastapi import FastAPI, status
from pydantic import BaseModel, StringConstraints

from .chunk_repository import save_document_chunks
from .document_processor import process_document

app = FastAPI()

DocumentString = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, pattern=r"^[^\x00]+$")
]


class Document(BaseModel):
    title: DocumentString
    description: DocumentString
    text: DocumentString
    category: Literal[
        "start_work",
        "development",
        "work_processes",
        "team_values",
        "contacts",
        "ai_answers",
        "company",
    ]


@app.post("/documents", status_code=status.HTTP_201_CREATED)
def create_document(document: Document) -> dict[str, int]:
    chunks = process_document(document.text)

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        document_id = conn.execute(
            """
            INSERT INTO documents (title, description, text, category)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (document.title, document.description, document.text, document.category),
        ).fetchone()[0]
        save_document_chunks(conn, document_id, chunks)

    return {"id": document_id, "chunk_count": len(chunks)}
