from dataclasses import dataclass

import asyncpg
from numpy.typing import NDArray


class DatabaseError(RuntimeError):
    """The chat store could not read from PostgreSQL."""


DATABASE_ERRORS = (asyncpg.PostgresError, asyncpg.InterfaceError, OSError, TimeoutError)


@dataclass(frozen=True)
class ChatMessage:
    role: str
    text: str


class ChatStore:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def get_history(
        self, user_id: int, message_id: int, *, limit: int
    ) -> list[ChatMessage]:
        try:
            rows = await self.pool.fetch(
                """
                SELECT role, text FROM messages
                WHERE user_id = $1 AND id <= $2
                  AND role IN ('user', 'assistant')
                  AND EXISTS (
                      SELECT 1 FROM messages
                      WHERE user_id = $1 AND id = $2 AND role = 'user'
                  )
                ORDER BY id DESC
                LIMIT $3
                """,
                user_id,
                message_id,
                limit,
            )
        except DATABASE_ERRORS as exc:
            raise DatabaseError("Could not load chat history") from exc

        return [ChatMessage(row["role"], row["text"]) for row in reversed(rows)]

    async def find_relevant_chunks(
        self, embedding: NDArray, *, limit: int, question: str = ""
    ) -> list[tuple[int, str]]:
        try:
            rows = await self.pool.fetch(
                """
                WITH terms AS (
                    SELECT term
                    FROM unnest(tsvector_to_array(to_tsvector('russian', $3))) AS term
                    WHERE length(term) >= 4
                )
                SELECT id, content
                FROM document_chunks
                ORDER BY (
                    1 - (embedding <=> $1::vector) / 2
                    + 0.3 * COALESCE((
                        SELECT avg((strpos(lower(content), term) > 0)::int)
                        FROM terms
                    ), 0)
                ) DESC, id
                LIMIT $2
                """,
                embedding,
                limit,
                question,
            )
        except DATABASE_ERRORS as exc:
            raise DatabaseError("Could not load relevant chunks") from exc

        return [(row["id"], row["content"]) for row in rows]
