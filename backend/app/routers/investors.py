from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from uuid import UUID

from app.database import get_db
from app.models.investor import Investor
from app.models.investor_stage import INVESTOR_STAGES
from app.models.user import User
from app.schemas.investor import (
    InvestorCreate,
    InvestorDetail,
    InvestorStageResponse,
    InvestorSummary,
    InvestorUpdate,
)
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/investors", tags=["investors"])


@router.get("/stages", response_model=list[InvestorStageResponse])
def list_investor_stages(
    current_user: User = Depends(get_current_user),
):
    """Return the canonical investor pipeline stages in display order."""
    return INVESTOR_STAGES


@router.get("", response_model=list[InvestorSummary])
def list_investors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all investors (summary fields only)."""
    return db.query(Investor).options(joinedload(Investor.primary_owner)).order_by(Investor.name).all()


@router.get("/{investor_id}", response_model=InvestorDetail)
def get_investor(
    investor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return full investor details including nested notes."""
    investor = (
        db.query(Investor)
        .options(joinedload(Investor.notes), joinedload(Investor.primary_owner))
        .filter(Investor.id == investor_id)
        .first()
    )
    if not investor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investor not found")
    return investor


@router.put("/{investor_id}", response_model=InvestorDetail)
def update_investor(
    investor_id: UUID,
    body: InvestorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Partially update an investor.
    Only fields present in the request body are written; omitted fields are left unchanged.
    """
    investor = (
        db.query(Investor)
        .options(joinedload(Investor.notes), joinedload(Investor.primary_owner))
        .filter(Investor.id == investor_id)
        .first()
    )
    if not investor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investor not found")

    updates = body.model_dump(exclude_unset=True)
    if "primary_owner_id" in updates and updates["primary_owner_id"] is not None:
        owner = db.query(User).filter(User.id == updates["primary_owner_id"]).first()
        if not owner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned user not found")
    for field, value in updates.items():
        setattr(investor, field, value)

    db.commit()
    db.refresh(investor)
    return investor


@router.post("", response_model=InvestorDetail, status_code=status.HTTP_201_CREATED)
def create_investor(
    body: InvestorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new investor."""
    payload = body.model_dump()
    owner_id = payload.get("primary_owner_id") or current_user.id
    owner = db.query(User).filter(User.id == owner_id).first()
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned user not found")
    payload["primary_owner_id"] = owner_id
    investor = Investor(**payload)
    db.add(investor)
    db.commit()
    db.refresh(investor)
    return investor
