from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from uuid import UUID

from app.database import get_db
from app.models.chat import Chat, ChatDocument, ChatMessage
from app.models.document import Document
from app.models.interaction import Interaction
from app.models.investor import Investor
from app.models.investor_stage import INVESTOR_STAGES
from app.models.note import Note
from app.models.user import User
from app.routers.ai import generate_ai_answer
from app.schemas.investor import (
    InvestorBriefingResponse,
    InvestorCreate,
    InvestorDetail,
    InvestorStageResponse,
    InvestorSummary,
    InvestorUpdate,
)
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/investors", tags=["investors"])

_BRIEFING_DOCUMENT_CHAR_LIMIT = 20000


def _stage_label(stage_key: str) -> str:
    for stage in INVESTOR_STAGES:
        if stage["key"] == stage_key:
            return stage["label"]
    return stage_key.replace("_", " ").title()


def _format_money(value: float | None) -> str:
    if value is None:
        return "Not recorded"
    return f"${value:,.0f}"


def _build_investor_briefing_prompt(
    *,
    investor: Investor,
    notes: list[Note],
    interactions: list[Interaction],
    documents: list[Document],
    document_context: str,
) -> str:
    owner = investor.primary_owner.name if investor.primary_owner else "Unassigned"
    interests = ", ".join(investor.interests or []) or "Not recorded"
    note_block = "\n".join(
        f"- {note.created_at.date() if note.created_at else 'Undated'}: {note.content}"
        for note in notes
    ) or "- No team notes recorded."
    interaction_block = "\n".join(
        (
            f"- {item.created_at.date() if item.created_at else 'Undated'} "
            f"[{item.type}] {item.title}: {item.description or 'No description.'}"
        )
        for item in interactions
    ) or "- No interactions recorded."
    document_list = "\n".join(f"- {doc.name}" for doc in documents) or "- No linked documents."
    context_note = (
        f"Linked document excerpts:\n{document_context}"
        if document_context
        else "No linked investor documents have extractable RAG text yet."
    )

    return f"""You are Grant Pilot's investor briefing assistant.

Create a concise but useful AI briefing for the investor profile below. Use all available internal context: investor metadata, current deal stage, assigned owner, team notes, interaction log, and linked document excerpts. Also use current web research for the investor/person/company, and clearly distinguish web-derived facts from internal Grant Pilot context when needed.

Investor profile:
- Name: {investor.name}
- Organization: {investor.organization or 'Not recorded'}
- Email: {investor.email or 'Not recorded'}
- Current deal stage: {_stage_label(investor.stage)}
- Assigned internal owner: {owner}
- Capacity: {_format_money(investor.capacity)}
- Current ask amount: {_format_money(investor.ask_amount)}
- Interests: {interests}

Team notes:
{note_block}

Interaction log:
{interaction_block}

Linked documents:
{document_list}

{context_note}

Write the briefing in Markdown with these sections:
## Snapshot
## Internal Relationship State
## Deal Stage Readout
## Document Intelligence
## Web Research Signals
## Recommended Next Moves
## Risks, Unknowns, And Questions

Keep it practical for a fundraising relationship manager. Prefer specific next actions over generic advice.
"""


def _collect_document_context(documents: list[Document]) -> str:
    parts: list[str] = []
    used_chars = 0
    for document in documents:
        chunks = sorted(document.chunks, key=lambda chunk: chunk.chunk_index)
        if not chunks:
            continue
        parts.append(f"\n### {document.name}")
        for chunk in chunks:
            if used_chars >= _BRIEFING_DOCUMENT_CHAR_LIMIT:
                parts.append("\n[Additional linked document text was omitted to keep the AI briefing prompt within limits.]")
                return "\n".join(parts).strip()
            remaining = _BRIEFING_DOCUMENT_CHAR_LIMIT - used_chars
            content = chunk.content[:remaining]
            parts.append(content)
            used_chars += len(content)
    return "\n\n".join(parts).strip()


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


@router.post("/{investor_id}/ai-briefing", response_model=InvestorBriefingResponse, status_code=status.HTTP_201_CREATED)
def generate_investor_ai_briefing(
    investor_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    investor = (
        db.query(Investor)
        .options(joinedload(Investor.primary_owner))
        .filter(Investor.id == investor_id)
        .first()
    )
    if not investor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investor not found")

    notes = (
        db.query(Note)
        .filter(Note.investor_id == investor_id)
        .order_by(Note.created_at.desc())
        .all()
    )
    interactions = (
        db.query(Interaction)
        .filter(Interaction.investor_id == investor_id)
        .order_by(Interaction.created_at.desc())
        .all()
    )
    documents = (
        db.query(Document)
        .options(joinedload(Document.chunks))
        .filter(Document.investor_id == investor_id)
        .order_by(Document.created_at.desc())
        .all()
    )

    document_context = _collect_document_context(documents)
    prompt = _build_investor_briefing_prompt(
        investor=investor,
        notes=notes,
        interactions=interactions,
        documents=documents,
        document_context=document_context,
    )
    answer = generate_ai_answer(prompt, enable_web_search=True)

    chat = Chat(
        user_id=current_user.id,
        title=f"AI briefing: {investor.name}"[:80],
    )
    db.add(chat)
    db.flush()

    db.add(ChatMessage(chat_id=chat.id, role="assistant", content=answer))
    for document in documents:
        db.add(ChatDocument(chat_id=chat.id, document_id=document.id))

    db.commit()
    db.refresh(chat)

    return InvestorBriefingResponse(
        chat_id=chat.id,
        answer=answer,
        sources=[document.name for document in documents],
    )


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
