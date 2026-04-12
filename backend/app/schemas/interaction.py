from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class InteractionCreate(BaseModel):
    investor_id: UUID
    type: str
    title: str
    description: str = ""


class InteractionResponse(BaseModel):
    id: UUID
    investor_id: UUID
    type: str
    title: str
    description: str | None
    created_at: datetime | None

    model_config = {"from_attributes": True}
