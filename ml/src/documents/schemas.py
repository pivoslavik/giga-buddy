from typing import Annotated, Literal
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field


class DocumentStatus(str, Enum):
    ADDED = "added"
    DELETED = "deleted"
    MODIFIED = "modified"


class IndexDocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_id: Annotated[int, Field(strict=True, gt=0, le=2**63 - 1)]
    status: DocumentStatus


class IndexDocumentResult(BaseModel):
    status: Literal["ok"] = "ok"
