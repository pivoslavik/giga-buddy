import os
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager

import asyncpg
import httpx
import uvicorn
from fastapi import FastAPI
from openai import AsyncOpenAI
from pgvector.asyncpg import register_vector

from ..health import health
from .chat import router as chat
from .chat.model_api_manager import ModelAPIManager
from .chat.service import ChatService
from .chat.store import ChatStore
from .documents import router as documents
from .documents.chunker import Chunker
from .documents.embeddings import Embeddings
from .documents.processor import DocumentProcessor


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    base_url = os.getenv("OPENAI_BASE_URL")
    api_key = os.getenv("OPENAI_API_KEY")
    chat_model = os.getenv("OPENAI_CHAT_MODEL")
    async with asyncpg.create_pool(
        os.environ["DATABASE_URL"],
        min_size=1,
        max_size=4,
        timeout=10,
        command_timeout=30,
        init=register_vector,
    ) as pool:
        async with AsyncExitStack() as stack:
            model_api = None
            if base_url and api_key and chat_model:
                client = await stack.enter_async_context(
                    AsyncOpenAI(
                        base_url=base_url,
                        api_key=api_key,
                        timeout=httpx.Timeout(180, connect=10, read=60),
                        max_retries=0,
                    )
                )
                model_api = ModelAPIManager(client, chat_model)
            embeddings = await Embeddings.load()
            try:
                app.state.chat_service = (
                    ChatService(ChatStore(pool), embeddings, model_api)
                    if model_api is not None
                    else None
                )
                app.state.document_processor = DocumentProcessor(
                    pool, Chunker(), embeddings
                )
                yield
            finally:
                await embeddings.close()


app = FastAPI(lifespan=lifespan)

app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(health.router)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
