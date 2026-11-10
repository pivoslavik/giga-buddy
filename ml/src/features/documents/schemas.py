from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class IndexDocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_id: Annotated[int, Field(strict=True, gt=0, le=2**63 - 1)]


class IndexDocumentResult(BaseModel):
    id: int
    chunk_count: int
