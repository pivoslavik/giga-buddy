import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI
from pgvector.asyncpg import register_vector

from .features.documents.router import router
from .features.documents.chunker import Chunker
from .features.documents.processor import DocumentProcessor
from .features.documents.embeddings import Embeddings


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with asyncpg.create_pool(
        os.environ["DATABASE_URL"],
        min_size=1,
        max_size=4,
        timeout=10,
        init=register_vector,
    ) as pool:
        embeddings = await Embeddings.load()
        try:
            app.state.document_processor = DocumentProcessor(
                pool, Chunker(), embeddings
            )
            yield
        finally:
            await embeddings.close()


app = FastAPI(lifespan=lifespan)
app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
