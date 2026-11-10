from psycopg import AsyncConnection


async def get_document_text(
    conn: AsyncConnection, document_id: int, *, lock: bool = False
) -> str | None:
    query = "SELECT text FROM documents WHERE id = %s"
    if lock:
        # Serialize chunk replacement for this document and protect the source text.
        query += " FOR UPDATE"
    cursor = await conn.execute(query, (document_id,))
    row = await cursor.fetchone()
    return row[0] if row is not None else None
