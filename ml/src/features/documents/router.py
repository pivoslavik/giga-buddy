import logging

import asyncpg
from fastapi import APIRouter, HTTPException, Request

from .processor import (
    DocumentChanged,
    DocumentNotFound,
    EmptyDocument,
)
from .embeddings import EmbeddingError, InferenceUnavailable
from .schemas import IndexDocumentRequest, IndexDocumentResult, DocumentStatus

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/documents", response_model=IndexDocumentResult)
async def index_document(
    payload: IndexDocumentRequest, request: Request
) -> IndexDocumentResult:
    document_id = payload.document_id
    try:
        match payload.status:
            case DocumentStatus.ADDED | DocumentStatus.MODIFIED:
                await request.app.state.document_processor.process_add_or_modify_document_chunks(
                    document_id
                )
            case DocumentStatus.DELETED:
                await request.app.state.document_processor.process_delete_document_chunks(
                    document_id
                )
    except DocumentNotFound as exc:
        raise HTTPException(404, "Document not found") from exc
    except EmptyDocument as exc:
        raise HTTPException(422, "Document text is empty") from exc
    except DocumentChanged as exc:
        raise HTTPException(409, "Document changed during indexing") from exc
    except InferenceUnavailable as exc:
        raise HTTPException(503, "Embedding inference is busy") from exc
    except (
        OSError,
        asyncpg.PostgresConnectionError,
        asyncpg.CannotConnectNowError,
        asyncpg.TooManyConnectionsError,
    ) as exc:
        logger.exception("Database unavailable while indexing document %s", document_id)
        raise HTTPException(503, "Database unavailable") from exc
    except asyncpg.PostgresError as exc:
        logger.exception("Database error while indexing document %s", document_id)
        raise HTTPException(500, "Could not store document chunks") from exc
    except EmbeddingError as exc:
        logger.exception("Inference failed for document %s", document_id)
        raise HTTPException(500, "Could not generate embeddings") from exc

    return IndexDocumentResult()
