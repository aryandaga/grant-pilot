from pydantic import BaseModel, field_validator
from uuid import UUID
from typing import List, Optional
from app.schemas.note import NoteResponse


class InvestorCreate(BaseModel):
    name: str
    stage: str
    organization: Optional[str] = None
    email: Optional[str] = None
    capacity: Optional[float] = None
    ask_amount: Optional[float] = None
    interests: Optional[List[str]] = None


class InvestorUpdate(BaseModel):
    """All fields optional — only supplied fields are written to the DB."""
    name: Optional[str] = None
    stage: Optional[str] = None
    organization: Optional[str] = None
    email: Optional[str] = None
    capacity: Optional[float] = None
    ask_amount: Optional[float] = None
    interests: Optional[List[str]] = None

    @field_validator("capacity")
    @classmethod
    def capacity_non_negative(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError("capacity cannot be negative")
        return v

    @field_validator("ask_amount")
    @classmethod
    def ask_amount_non_negative(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError("ask_amount cannot be negative")
        return v


class InvestorSummary(BaseModel):
    """Lightweight shape returned by the list endpoint."""
    id: UUID
    name: str
    stage: str
    organization: Optional[str] = None
    ask_amount: Optional[float] = None

    model_config = {"from_attributes": True}


class InvestorDetail(BaseModel):
    """Full shape returned by the detail endpoint, including nested notes."""
    id: UUID
    name: str
    stage: str
    organization: Optional[str] = None
    email: Optional[str] = None
    capacity: Optional[float] = None
    ask_amount: Optional[float] = None
    interests: Optional[List[str]] = None
    notes: List[NoteResponse] = []

    model_config = {"from_attributes": True}
