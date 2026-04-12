from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class DocumentSearchRequest(BaseModel):
    query: str
    investor_id: UUID | None = None


class DocumentChunkResult(BaseModel):
    content: str
    document_id: UUID
    document_name: str
    score: float  # cosine similarity [0, 1], higher = more relevant


class DocumentUploadResponse(BaseModel):
    id: UUID
    name: str
    investor_id: UUID | None
    chunk_count: int
    created_at: datetime | None
    model_config = {"from_attributes": True}


class DocumentListItem(BaseModel):
    id: UUID
    name: str
    investor_name: str | None
    created_at: datetime | None
    chunk_count: int
