from collections.abc import AsyncGenerator

import httpx
from openai import APIError
from openai.types.chat import ChatCompletionMessageParam

from ..documents.embeddings import Embeddings
from .model_api_manager import ModelAPIError, ModelAPIManager, build_chat_messages
from .store import ChatStore

UPSTREAM_ERRORS = (APIError, httpx.HTTPError, TimeoutError, ValueError)


class MessageNotFound(Exception):
    pass


class EmptyMessage(Exception):
    pass


class ChatService:
    def __init__(
        self, store: ChatStore, embeddings: Embeddings, model_api: ModelAPIManager
    ) -> None:
        self.store = store
        self.embeddings = embeddings
        self.model_api = model_api

    async def generate_reply(self, user_id: int, message_id: int) -> str:
        messages = await self._prepare_messages(user_id, message_id)
        try:
            return await self.model_api.generate_reply(messages)
        except UPSTREAM_ERRORS as exc:
            raise ModelAPIError("Model API request failed") from exc

    async def stream_reply(
        self, user_id: int, message_id: int
    ) -> AsyncGenerator[str, None]:
        messages = await self._prepare_messages(user_id, message_id)
        return self._stream_reply(messages)

    async def _prepare_messages(
        self, user_id: int, message_id: int
    ) -> list[ChatCompletionMessageParam]:
        history = await self.store.get_history(user_id, message_id)
        if not history:
            raise MessageNotFound

        question = history[-1].text
        if not question.strip():
            raise EmptyMessage

        [embedding] = await self.embeddings.encode([question], prefix="query")
        chunks = await self.store.find_relevant_chunks(embedding)
        return build_chat_messages(history, chunks)

    async def _stream_reply(
        self, messages: list[ChatCompletionMessageParam]
    ) -> AsyncGenerator[str, None]:
        stream = self.model_api.stream(messages)
        try:
            async for delta in stream:
                yield delta
        except UPSTREAM_ERRORS as exc:
            raise ModelAPIError("Model API request failed") from exc
        finally:
            await stream.aclose()
