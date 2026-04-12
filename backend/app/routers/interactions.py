from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.interaction import Interaction
from app.models.investor import Investor
from app.models.user import User
from app.schemas.interaction import InteractionCreate, InteractionResponse
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api", tags=["interactions"])


@router.get("/interactions", response_model=list[InteractionResponse])
def list_interactions(
    investor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all interactions for a given investor."""
    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investor not found")

    return (
        db.query(Interaction)
        .filter(Interaction.investor_id == investor_id)
        .order_by(Interaction.created_at.desc())
        .all()
    )


@router.post("/interactions", response_model=InteractionResponse, status_code=status.HTTP_201_CREATED)
def create_interaction(
    body: InteractionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new interaction log for an investor."""
    investor = db.query(Investor).filter(Investor.id == body.investor_id).first()
    if not investor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investor not found")

    interaction = Interaction(
        investor_id=body.investor_id,
        type=body.type,
        title=body.title,
        description=body.description,
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return interaction
