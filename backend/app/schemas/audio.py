from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AudioTranscriptionResponse(BaseModel):
    id: UUID
    name: str
    document_id: UUID
    transcript: str
    chunk_count: int
    created_at: datetime | None


class SpeechToTextResponse(BaseModel):
    transcript: str
