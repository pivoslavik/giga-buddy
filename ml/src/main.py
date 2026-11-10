import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pgvector.psycopg import register_vector_async
from psycopg_pool import AsyncConnectionPool

from .features.documents.router import router
from .features.documents.chunker import Chunker
from .features.documents.processor import DocumentProcessor
from .features.documents.embeddings import Embeddings


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = AsyncConnectionPool(
        os.environ["DATABASE_URL"],
        open=False,
        min_size=1,
        max_size=4,
        kwargs={"autocommit": True},
        configure=register_vector_async,
    )
    async with pool:
        await pool.wait()
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

    if os.name == "nt":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    uvicorn.run(app, host="0.0.0.0", port=8000, loop="none")
