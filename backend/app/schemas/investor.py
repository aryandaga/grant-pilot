from pydantic import BaseModel, field_validator
from uuid import UUID
from typing import List, Optional
from app.schemas.note import NoteResponse
from app.models.investor_stage import INVESTOR_STAGE_KEYS, normalize_investor_stage
from app.models.user import UserRole


class AssignedUser(BaseModel):
    id: UUID
    name: str
    email: str
    role: UserRole

    model_config = {"from_attributes": True}


class InvestorCreate(BaseModel):
    name: str
    stage: str
    primary_owner_id: Optional[UUID] = None
    organization: Optional[str] = None
    email: Optional[str] = None
    capacity: Optional[float] = None
    ask_amount: Optional[float] = None
    interests: Optional[List[str]] = None

    @field_validator("stage")
    @classmethod
    def stage_is_supported(cls, v: str) -> str:
        stage = normalize_investor_stage(v)
        if stage not in INVESTOR_STAGE_KEYS:
            raise ValueError("stage is not a supported investor pipeline stage")
        return stage


class InvestorUpdate(BaseModel):
    """All fields optional — only supplied fields are written to the DB."""
    name: Optional[str] = None
    stage: Optional[str] = None
    primary_owner_id: Optional[UUID] = None
    organization: Optional[str] = None
    email: Optional[str] = None
    capacity: Optional[float] = None
    ask_amount: Optional[float] = None
    interests: Optional[List[str]] = None

    @field_validator("stage")
    @classmethod
    def stage_is_supported(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stage = normalize_investor_stage(v)
        if stage not in INVESTOR_STAGE_KEYS:
            raise ValueError("stage is not a supported investor pipeline stage")
        return stage

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
    primary_owner_id: Optional[UUID] = None
    primary_owner: Optional[AssignedUser] = None

    model_config = {"from_attributes": True}


class InvestorStageResponse(BaseModel):
    key: str
    label: str
    short_label: str
    order: int


class InvestorBriefingResponse(BaseModel):
    chat_id: UUID
    answer: str
    sources: List[str] = []


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
    primary_owner_id: Optional[UUID] = None
    primary_owner: Optional[AssignedUser] = None
    notes: List[NoteResponse] = []

    model_config = {"from_attributes": True}
