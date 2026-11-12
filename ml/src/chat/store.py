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

    async def get_history(self, user_id: int, message_id: int) -> list[ChatMessage]:
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
                LIMIT 20
                """,
                user_id,
                message_id,
            )
        except DATABASE_ERRORS as exc:
            raise DatabaseError("Could not load chat history") from exc

        return [ChatMessage(row["role"], row["text"]) for row in reversed(rows)]

    async def find_relevant_chunks(self, embedding: NDArray) -> list[tuple[int, str]]:
        try:
            rows = await self.pool.fetch(
                """
                SELECT id, content FROM document_chunks
                ORDER BY embedding <=> $1::vector, id
                LIMIT 5
                """,
                embedding,
            )
        except DATABASE_ERRORS as exc:
            raise DatabaseError("Could not load relevant chunks") from exc

        return [(row["id"], row["content"]) for row in rows]
