from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class NoteCreate(BaseModel):
    investor_id: UUID
    content: str


class NoteResponse(BaseModel):
    id: UUID
    investor_id: UUID
    content: str
    created_by: UUID | None
    created_at: datetime | None

    model_config = {"from_attributes": True}
