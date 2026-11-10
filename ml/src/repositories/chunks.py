import numpy as np
from psycopg import AsyncConnection


async def replace_document_chunks(
    conn: AsyncConnection, document_id: int, chunks: list[str], vectors: np.ndarray
) -> None:
    """Replace chunks inside the caller's transaction with the document row locked."""
    rows = [
        (document_id, chunk, vector, index)
        for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True))
    ]
    async with conn.cursor() as cursor:
        await cursor.execute(
            "DELETE FROM document_chunks WHERE document_id = %s", (document_id,)
        )
        await cursor.executemany(
            """
            INSERT INTO document_chunks (document_id, content, embedding, chunk_index)
            VALUES (%s, %s, %s, %s)
            """,
            rows,
        )
