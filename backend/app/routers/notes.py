from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.investor import Investor
from app.models.note import Note
from app.models.user import User
from app.schemas.note import NoteCreate, NoteResponse
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api", tags=["notes"])


@router.get("/investors/{investor_id}/notes", response_model=list[NoteResponse])
def list_notes(
    investor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all notes for a given investor."""
    investor = db.query(Investor).filter(Investor.id == investor_id).first()
    if not investor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investor not found")

    return (
        db.query(Note)
        .filter(Note.investor_id == investor_id)
        .order_by(Note.created_at.desc())
        .all()
    )


@router.post("/notes", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
def create_note(
    body: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a note for an investor. created_by is set to the authenticated user."""
    investor = db.query(Investor).filter(Investor.id == body.investor_id).first()
    if not investor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investor not found")

    note = Note(
        investor_id=body.investor_id,
        content=body.content,
        created_by=current_user.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note
