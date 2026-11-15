import re
from collections.abc import AsyncGenerator

import httpx
from openai import APIError
from openai.types.chat import ChatCompletionMessageParam

from ..mcp.client import BuddyMCPClient
from ..documents.embeddings import Embeddings
from .model_api_manager import ModelAPIError, ModelAPIManager, build_chat_messages
from .store import ChatStore

UPSTREAM_ERRORS = (APIError, httpx.HTTPError, TimeoutError, ValueError)
CONFIRMATION = re.compile(
    r"подтверждаю ([a-f0-9]{32}) ([1-9][0-9]{0,8})", re.IGNORECASE
)
DEMO_APPROVAL = re.compile(r"демо согласовать (ACC-[a-f0-9]{32})", re.IGNORECASE)
SUBMISSION_MESSAGES = {
    "unavailable": "Черновик недоступен или его версия изменилась. Подготовь новый.",
    "submission_disabled": "Отправка тестовых заявок отключена.",
    "recheck_required": "Данные PR изменились. Проверь текущий commit и подготовь новый черновик.",
    "overlap": "Интервал пересекается с ранее отправленной заявкой. Укажи другое время.",
    "tool_failed": "Не удалось проверить результат отправки. Повтори подтверждение того же черновика.",
}


class MessageNotFound(Exception):
    pass


class EmptyMessage(Exception):
    pass


class ChatService:
    def __init__(
        self,
        store: ChatStore,
        embeddings: Embeddings,
        model_api: ModelAPIManager,
        buddy_mcp: BuddyMCPClient | None = None,
    ) -> None:
        self.store = store
        self.embeddings = embeddings
        self.model_api = model_api
        self.buddy_mcp = buddy_mcp

    async def generate_reply(self, user_id: int, message_id: int) -> str:
        messages, reply = await self._prepare_messages(user_id, message_id)
        if reply is not None:
            return reply
        try:
            return await self.model_api.generate_reply(messages)
        except UPSTREAM_ERRORS as exc:
            raise ModelAPIError("Model API request failed") from exc

    async def stream_reply(
        self, user_id: int, message_id: int
    ) -> AsyncGenerator[str, None]:
        messages, reply = await self._prepare_messages(user_id, message_id)
        return self._stream_reply(messages, reply)

    async def _prepare_messages(
        self, user_id: int, message_id: int
    ) -> tuple[list[ChatCompletionMessageParam], str | None]:
        history = await self.store.get_history(user_id, message_id)
        if not history:
            raise MessageNotFound

        question = history[-1].text
        if not question.strip():
            raise EmptyMessage

        approval = DEMO_APPROVAL.fullmatch(question.strip())
        if approval and self.buddy_mcp is not None:
            request_id = "ACC-" + approval[1][4:].lower()
            try:
                result = await self.buddy_mcp.approve_demo_access(user_id, request_id)
            except (*UPSTREAM_ERRORS, ExceptionGroup) as exc:
                raise ModelAPIError("MCP demo approval failed") from exc
            if result.get("status") == "approved":
                return (
                    [],
                    f"Тестовая заявка `{request_id}` согласована. Это имитация согласования.",
                )
            if result.get("status") == "unavailable":
                return [], "Тестовая заявка недоступна для согласования."
            return [], "Не удалось согласовать тестовую заявку."

        confirmation = CONFIRMATION.fullmatch(question.strip())
        if self.buddy_mcp is not None and confirmation:
            action_id, version = confirmation.groups()
            try:
                result = await self.buddy_mcp.submit_draft(
                    user_id, action_id.lower(), int(version)
                )
            except (*UPSTREAM_ERRORS, ExceptionGroup) as exc:
                raise ModelAPIError("MCP submission failed") from exc
            status = result.get("status")
            request_id = result.get("request_id")
            if status == "approved" and request_id:
                return [], f"Тестовая заявка `{request_id}` уже согласована."
            if status == "pending_approval" and request_id:
                return (
                    [],
                    f"Тестовая заявка `{request_id}` создана. Ожидает согласования.",
                )
            if status == "review_requested" and request_id:
                return (
                    [],
                    f"Ревью запрошено в тестовом сервисе. Номер операции `{request_id}`.",
                )
            return [], SUBMISSION_MESSAGES.get(
                status, SUBMISSION_MESSAGES["tool_failed"]
            )

        [embedding] = await self.embeddings.encode([question], prefix="query")
        chunks = await self.store.find_relevant_chunks(embedding)
        messages = build_chat_messages(history, chunks)
        if self.buddy_mcp is None:
            return messages, None
        try:
            async with self.buddy_mcp.connect(user_id) as session:
                reply = await self.model_api.collect_tool_results(messages, session)
        except (*UPSTREAM_ERRORS, ExceptionGroup) as exc:
            raise ModelAPIError("MCP tool selection failed") from exc
        return messages, reply

    async def _stream_reply(
        self, messages: list[ChatCompletionMessageParam], reply: str | None
    ) -> AsyncGenerator[str, None]:
        if reply is not None:
            yield reply
            return
        stream = self.model_api.stream(messages)
        try:
            async for delta in stream:
                yield delta
        except UPSTREAM_ERRORS as exc:
            raise ModelAPIError("Model API request failed") from exc
        finally:
            await stream.aclose()
