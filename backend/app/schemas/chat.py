from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import List, Optional


class ChatCreate(BaseModel):
    title: Optional[str] = None


class MessageCreate(BaseModel):
    role: str     # "user" | "assistant"
    content: str


class MessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    created_at: datetime | None

    model_config = {"from_attributes": True}


class ChatResponse(BaseModel):
    id: UUID
    title: Optional[str]
    created_at: datetime | None

    model_config = {"from_attributes": True}


class ChatDocumentResponse(BaseModel):
    id: UUID
    name: str
    investor_id: UUID | None
    chunk_count: int
    created_at: datetime | None


class ChatDetailResponse(BaseModel):
    id: UUID
    title: Optional[str]
    created_at: datetime | None
    messages: List[MessageResponse] = []
    documents: List[ChatDocumentResponse] = []

    model_config = {"from_attributes": True}
