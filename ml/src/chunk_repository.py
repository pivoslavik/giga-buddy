import numpy as np
from psycopg import Connection
from pgvector.psycopg import register_vector


def save_document_chunks(
    conn: Connection, document_id: int, chunks: list[dict]
) -> None:
    register_vector(conn)

    with conn.transaction():
        with conn.cursor() as cursor:
            for chunk in chunks:
                embedding = np.asarray(chunk["embedding"], dtype=np.float32)

                cursor.execute(
                    """
                    INSERT INTO document_chunks
                        (document_id, content, embedding, chunk_index)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        document_id,
                        chunk["content"],
                        embedding,
                        chunk["chunk_index"],
                    ),
                )
