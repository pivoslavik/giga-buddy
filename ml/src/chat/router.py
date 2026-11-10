import json
import logging

import aiohttp
import asyncpg
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .features.documents.embeddings import EmbeddingError, InferenceUnavailable
from .provider import ProviderError

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)
UPSTREAM_ERRORS = (aiohttp.ClientError, TimeoutError, ProviderError, ValueError)
DATABASE_ERRORS = (asyncpg.PostgresError, asyncpg.InterfaceError, OSError, TimeoutError)

SYSTEM_PROMPT = """
Ты — AI-buddy, помощник стажёра Авито. Ты помогаешь разобраться
в рабочих инструментах, процессах и материалах команды,
понять следующий шаг и подготовиться к самостоятельной работе.

Отвечай на языке пользователя. Если вопрос на русском, весь поясняющий текст
пиши по-русски: не вставляй китайские иероглифы и случайные слова на других языках.
Сохраняй оригинальное написание названий продуктов, кода, команд и цитат,
если они нужны для ответа. Перед отправкой проверь, что не смешиваешь языки.
Общайся доброжелательно и по делу,
как опытный коллега. Объясняй незнакомые термины простыми словами.
Не представляйся реальным сотрудником или официальным представителем компании.
"""


class AnalyzeRequest(BaseModel):
    user_id: int = Field()
    stream: bool = False


class AnalyzeResponse(BaseModel):
    response: str


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def stream_response(provider, messages):
    parts = []
    try:
        async for delta in provider.stream(messages):
            parts.append(delta)
            yield sse("token", {"delta": delta})
        response = "".join(parts)
        if not response.strip():
            raise ProviderError("Empty completion")
        yield sse("done", {"response": response})
    except UPSTREAM_ERRORS:
        logger.warning("Model API stream failed")
        yield sse("error", {"detail": "Model API request failed"})


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    responses={200: {"content": {"text/event-stream": {"schema": {"type": "string"}}}}},
)
async def analyze(body: AnalyzeRequest, request: Request):
    pool = request.app.state.pool
    provider = request.app.state.provider
    if provider is None:
        raise HTTPException(503, "Model API is not configured")
    try:
        message = await pool.fetchrow(
            """
            SELECT text FROM messages
            WHERE user_id = $1 AND role = 'user'
            ORDER BY id DESC LIMIT 1
            """,
            body.user_id,
        )
    except DATABASE_ERRORS as exc:
        logger.warning("Database request failed")
        raise HTTPException(503, "Database unavailable") from exc
    if message is None:
        raise HTTPException(404, "No user messages found")
    if not message["text"].strip():
        raise HTTPException(422, "Last user message is empty")

    try:
        [embedding] = await request.app.state.embeddings.encode(
            [message["text"]], prefix="query"
        )
    except InferenceUnavailable as exc:
        raise HTTPException(503, "Embedding inference is busy") from exc
    except EmbeddingError as exc:
        logger.warning("Local embedding failed")
        raise HTTPException(503, "Embedding model unavailable") from exc
    try:
        chunks = await pool.fetch(
            """
            SELECT id, content FROM document_chunks
            ORDER BY embedding <=> $1::vector, id
            LIMIT 5
            """,
            embedding,
        )
    except DATABASE_ERRORS as exc:
        logger.warning("Database request failed")
        raise HTTPException(503, "Database unavailable") from exc

    context = "\n\n".join(f"[{chunk['id']}] {chunk['content']}" for chunk in chunks)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Фрагменты базы знаний:\n{context or 'Подходящих фрагментов нет.'}"
                f"\n\nВопрос пользователя:\n{message['text']}"
            ),
        },
    ]
    if body.stream or "text/event-stream" in request.headers.get("accept", ""):
        return StreamingResponse(
            stream_response(provider, messages),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    try:
        return AnalyzeResponse(response=await provider.complete(messages))
    except UPSTREAM_ERRORS as exc:
        logger.warning("Completion API request failed")
        raise HTTPException(502, "Model API request failed") from exc
