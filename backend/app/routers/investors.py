from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from uuid import UUID

from app.database import get_db
from app.models.investor import Investor
from app.models.user import User
from app.schemas.investor import InvestorCreate, InvestorUpdate, InvestorSummary, InvestorDetail
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/investors", tags=["investors"])


@router.get("", response_model=list[InvestorSummary])
def list_investors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all investors (summary fields only)."""
    return db.query(Investor).order_by(Investor.name).all()


@router.get("/{investor_id}", response_model=InvestorDetail)
def get_investor(
    investor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return full investor details including nested notes."""
    investor = (
        db.query(Investor)
        .options(joinedload(Investor.notes))
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
        .options(joinedload(Investor.notes))
        .filter(Investor.id == investor_id)
        .first()
    )
    if not investor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investor not found")

    updates = body.model_dump(exclude_unset=True)
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
    investor = Investor(**body.model_dump())
    db.add(investor)
    db.commit()
    db.refresh(investor)
    return investor
