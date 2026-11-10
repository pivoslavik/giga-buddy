from asyncpg import Pool

from .chunker import Chunker
from .embeddings import Embeddings
from .repository import get_document_text, replace_document_chunks


class DocumentNotFound(Exception):
    pass


class EmptyDocument(Exception):
    pass


class DocumentChanged(Exception):
    pass


class DocumentProcessor:
    def __init__(self, pool: Pool, chunker: Chunker, embeddings: Embeddings):
        self._pool = pool
        self._chunker = chunker
        self._embeddings = embeddings

    async def process(self, document_id: int) -> int:
        async with self._pool.acquire(timeout=10) as conn:
            text = await get_document_text(conn, document_id)
        if text is None:
            raise DocumentNotFound

        chunks = self._chunker.split(text)
        if not chunks:
            raise EmptyDocument
        vectors = await self._embeddings.encode(chunks)

        async with self._pool.acquire(timeout=10) as conn:
            async with conn.transaction():
                current_text = await get_document_text(conn, document_id, lock=True)
                if current_text is None:
                    raise DocumentNotFound
                if current_text != text:
                    raise DocumentChanged
                await replace_document_chunks(conn, document_id, chunks, vectors)
        return len(chunks)
