import json
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import aclosing

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..documents.embeddings import EmbeddingError, InferenceUnavailable
from .model_api_manager import ModelAPIError
from .service import ChatService, EmptyMessage, MessageNotFound
from .store import DatabaseError

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)


class AnalyzeRequest(BaseModel):
    user_id: int = Field(gt=0, le=2**63 - 1, strict=True)
    message_id: int = Field(gt=0, le=2**63 - 1, strict=True)
    stream: bool = False


class AnalyzeResponse(BaseModel):
    response: str


def sse(event: str, data: dict[str, str]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def stream_response(stream: AsyncGenerator[str, None]) -> AsyncIterator[str]:
    parts = []
    try:
        async with aclosing(stream):
            async for delta in stream:
                parts.append(delta)
                yield sse("token", {"delta": delta})
        response = "".join(parts)
        if not response.strip():
            raise ModelAPIError("Empty completion")
        yield sse("done", {"response": response})
    except ModelAPIError:
        logger.warning("Model API stream failed")
        yield sse("error", {"detail": "Model API request failed"})


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    responses={200: {"content": {"text/event-stream": {"schema": {"type": "string"}}}}},
)
async def analyze(
    body: AnalyzeRequest, request: Request
) -> AnalyzeResponse | StreamingResponse:
    service: ChatService | None = request.app.state.chat_service
    if service is None:
        raise HTTPException(503, "Model API is not configured")

    try:
        if body.stream or "text/event-stream" in request.headers.get("accept", ""):
            stream = await service.stream_reply(body.user_id, body.message_id)
            return StreamingResponse(
                stream_response(stream),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        response = await service.generate_reply(body.user_id, body.message_id)
        return AnalyzeResponse(response=response)
    except MessageNotFound as exc:
        raise HTTPException(404, "Message not found") from exc
    except EmptyMessage as exc:
        raise HTTPException(422, "Message is empty") from exc
    except DatabaseError as exc:
        logger.warning("Chat database request failed", exc_info=True)
        raise HTTPException(503, "Database unavailable") from exc
    except InferenceUnavailable as exc:
        raise HTTPException(503, "Embedding inference is busy") from exc
    except EmbeddingError as exc:
        logger.warning("Local embedding failed")
        raise HTTPException(503, "Embedding model unavailable") from exc
    except ModelAPIError as exc:
        logger.warning("Completion API request failed")
        raise HTTPException(502, "Model API request failed") from exc
