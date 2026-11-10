import os
from contextlib import asynccontextmanager

import aiohttp
import asyncpg
import uvicorn
from fastapi import FastAPI
from pgvector.asyncpg import register_vector

from ..health import health
from . import chat
from .features.documents.chunker import Chunker
from .features.documents.embeddings import Embeddings
from .features.documents.processor import DocumentProcessor
from .features.documents.router import router as documents_router
from .provider import Provider


@asynccontextmanager
async def lifespan(app: FastAPI):
    provider_config = {
        "base_url": os.getenv("OPENAI_BASE_URL"),
        "api_key": os.getenv("OPENAI_API_KEY"),
        "chat_model": os.getenv("OPENAI_CHAT_MODEL"),
    }
    async with asyncpg.create_pool(
        os.environ["DATABASE_URL"],
        min_size=1,
        max_size=4,
        timeout=10,
        command_timeout=30,
        init=register_vector,
    ) as pool:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=180, sock_connect=10, sock_read=60)
        ) as session:
            embeddings = await Embeddings.load()
            try:
                app.state.pool = pool
                app.state.embeddings = embeddings
                app.state.document_processor = DocumentProcessor(
                    pool, Chunker(), embeddings
                )
                app.state.provider = (
                    Provider(session=session, **provider_config)
                    if all(provider_config.values())
                    else None
                )
                yield
            finally:
                await embeddings.close()


app = FastAPI(lifespan=lifespan)

app.include_router(documents_router)
app.include_router(chat.router)
app.include_router(health.router)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
