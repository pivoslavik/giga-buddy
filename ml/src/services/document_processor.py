from psycopg_pool import AsyncConnectionPool

from ..repositories.chunks import replace_document_chunks
from ..repositories.documents import get_document_text
from .chunker import Chunker
from .embeddings import Embeddings


class DocumentNotFound(Exception):
    pass


class EmptyDocument(Exception):
    pass


class DocumentChanged(Exception):
    pass


class DocumentProcessor:
    def __init__(
        self, pool: AsyncConnectionPool, chunker: Chunker, embeddings: Embeddings
    ):
        self._pool = pool
        self._chunker = chunker
        self._embeddings = embeddings

    async def process(self, document_id: int) -> int:
        async with self._pool.connection() as conn:
            text = await get_document_text(conn, document_id)
        if text is None:
            raise DocumentNotFound

        chunks = self._chunker.split(text)
        if not chunks:
            raise EmptyDocument
        vectors = await self._embeddings.encode(chunks)

        async with self._pool.connection() as conn:
            async with conn.transaction():
                current_text = await get_document_text(conn, document_id, lock=True)
                if current_text is None:
                    raise DocumentNotFound
                if current_text != text:
                    raise DocumentChanged
                await replace_document_chunks(conn, document_id, chunks, vectors)
        return len(chunks)
