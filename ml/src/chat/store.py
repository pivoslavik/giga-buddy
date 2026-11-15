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
                WITH semantic AS (
                    SELECT id, row_number() OVER (
                        ORDER BY embedding <=> $1::vector, id
                    ) AS rank
                    FROM document_chunks
                    ORDER BY rank
                    LIMIT $2
                ),
                words AS (
                    SELECT tsvector_to_array(to_tsvector('russian', $3)) AS terms
                ),
                lexical_scores AS (
                    SELECT id, cardinality(ARRAY(
                        SELECT term
                        FROM unnest(words.terms) AS term
                        WHERE term = ANY(tsvector_to_array(to_tsvector('russian', content)))
                           OR (length(term) >= 4 AND strpos(lower(content), term) > 0)
                    )) AS matches
                    FROM document_chunks CROSS JOIN words
                ),
                lexical AS (
                    SELECT id, row_number() OVER (ORDER BY matches DESC, id) AS rank
                    FROM lexical_scores
                    WHERE matches > 0
                    ORDER BY rank
                    LIMIT $2
                )
                SELECT chunks.id, chunks.content
                FROM semantic FULL JOIN lexical USING (id)
                JOIN document_chunks AS chunks USING (id)
                ORDER BY coalesce(lexical.rank = 1, false) DESC,
                         coalesce(1.0 / (60 + semantic.rank), 0)
                       + coalesce(1.0 / (60 + lexical.rank), 0) DESC,
                         lexical.rank NULLS LAST, chunks.id
                LIMIT $2
                """,
                embedding,
                limit,
                question,
            )
        except DATABASE_ERRORS as exc:
            raise DatabaseError("Could not load relevant chunks") from exc

        return [(row["id"], row["content"]) for row in rows]
