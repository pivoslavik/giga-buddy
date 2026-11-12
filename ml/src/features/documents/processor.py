from asyncpg import Pool

from .chunker import Chunker
from .embeddings import Embeddings
from .repository import (
    get_document_text,
    replace_document_chunks,
    delete_document_chunks,
)


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

    async def _collect_chuncks(self, document_id: int):
        async with self._pool.acquire(timeout=10) as conn:
            text = await get_document_text(conn, document_id)
        if text is None:
            raise DocumentNotFound
        chunks = self._chunker.split(text)
        if not chunks:
            raise EmptyDocument
        vectors = await self._embeddings.encode(chunks)
        return text, chunks, vectors

    async def _process_chuncks(self, document_id: int):
        text, chunks, vectors = await self._collect_chuncks(document_id)
        async with self._pool.acquire(timeout=10) as conn:
            async with conn.transaction():
                current_text = await get_document_text(conn, document_id, lock=True)
                if current_text is None:
                    raise DocumentNotFound
                if current_text != text:
                    raise DocumentChanged
                await replace_document_chunks(conn, document_id, chunks, vectors)

    async def process_add_or_modify_documents_chunks(self, document_id: int):
        await self._process_chuncks(document_id=document_id)
        return

    async def process_delete_documents_chunks(self, document_id: int):
        async with self._pool.acquire(timeout=10) as conn:
            async with conn.transaction():
                await delete_document_chunks(conn, document_id)
        return
