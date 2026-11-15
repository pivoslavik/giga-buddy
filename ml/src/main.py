<<<<<<< HEAD
=======
import logging
import os
>>>>>>> main
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager

import asyncpg
import httpx
import uvicorn
from fastapi import FastAPI
from openai import AsyncOpenAI
from pgvector.asyncpg import register_vector

from ..health import health
from .mcp.client import BuddyMCPClient
from .chat import router as chat
from .chat.model_api_manager import ModelAPIManager
from .chat.service import ChatService
from .chat.store import ChatStore
from .config import Config
from .documents import router as documents
from .documents.chunker import Chunker
from .documents.embeddings import Embeddings
from .documents.processor import DocumentProcessor


class HealthCheckLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not isinstance(record.args, tuple) or len(record.args) != 5:
            return True
        _, method, path, _, status = record.args
        return (method, path, status) != ("GET", "/health", 200)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    config = Config.from_env()
    buddy_mcp = (
        BuddyMCPClient(
            mcp_url,
            config.buddy_mcp_token,
            config.buddy_mcp_submit_token
        )
        if mcp_url
        else None
    )
    async with asyncpg.create_pool(
        config.database_url,
        min_size=1,
        max_size=4,
        timeout=10,
        command_timeout=30,
        init=register_vector,
    ) as pool:
        async with AsyncExitStack() as stack:
            model_api = None
            if (
                config.openai_base_url
                and config.openai_api_key
                and config.openai_chat_model
            ):
                client = await stack.enter_async_context(
                    AsyncOpenAI(
                        base_url=config.openai_base_url,
                        api_key=config.openai_api_key,
                        timeout=httpx.Timeout(180, connect=10, read=60),
                        max_retries=0,
                    )
                )
                model_api = ModelAPIManager(client, config.openai_chat_model)
            embeddings = await Embeddings.load(max_waiting=config.inference_max_waiting)
            try:
                app.state.chat_service = (
                    ChatService(
                        ChatStore(pool),
                        embeddings,
                        model_api,
                        buddy_mcp,
                        messages_to_context=config.messages_to_context,
                        documents_to_context=config.documents_to_context,
                    )
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
    logging.getLogger("uvicorn.access").addFilter(HealthCheckLogFilter())
    uvicorn.run(app, host="0.0.0.0", port=8000)
