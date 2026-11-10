import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pgvector.psycopg import register_vector_async
from psycopg_pool import AsyncConnectionPool

from .api.documents import router
from .services.chunker import Chunker
from .services.document_processor import DocumentProcessor
from .services.embeddings import Embeddings


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
