import numpy as np
from asyncpg import Connection


async def replace_document_chunks(
    conn: Connection, document_id: int, chunks: list[str], vectors: np.ndarray
) -> None:
    """Replace chunks inside the caller's transaction with the document row locked."""
    rows = [
        (document_id, chunk, vector, index)
        for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True))
    ]
    await conn.execute(
        "DELETE FROM document_chunks WHERE document_id = $1", document_id
    )
    await conn.executemany(
        """
        INSERT INTO document_chunks (document_id, content, embedding, chunk_index)
        VALUES ($1, $2, $3, $4)
        """,
        rows,
    )


async def get_document_text(
    conn: Connection, document_id: int, *, lock: bool = False
) -> str | None:
    query = "SELECT text FROM documents WHERE id = $1"
    if lock:
        # Serialize chunk replacement for this document and protect the source text.
        query += " FOR UPDATE"
    return await conn.fetchval(query, document_id)
