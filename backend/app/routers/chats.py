from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.chat import Chat, ChatDocument, ChatMessage
from app.models.document import Document, DocumentChunk, DocumentTranscript
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.chat import (
    ChatCreate,
    ChatDetailResponse,
    ChatResponse,
    MessageCreate,
    MessageResponse,
)
from app.schemas.document import DocumentUploadResponse
from app.services.audio_transcription import is_supported_audio_upload, transcribe_audio_bytes
from app.services.document_ingestion import ingest_pdf_document, ingest_text_document

router = APIRouter(prefix="/api/chats", tags=["chats"])


@router.post("", response_model=ChatResponse, status_code=status.HTTP_201_CREATED)
def create_chat(
    body: ChatCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = Chat(user_id=current_user.id, title=body.title)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


@router.get("", response_model=list[ChatResponse])
def list_chats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Chat)
        .filter(Chat.user_id == current_user.id)
        .order_by(Chat.created_at.desc())
        .all()
    )


@router.get("/{chat_id}", response_model=ChatDetailResponse)
def get_chat(
    chat_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found.")
    documents = (
        db.query(
            Document.id,
            Document.name,
            Document.investor_id,
            Document.created_at,
            ChatDocument.created_at.label("attached_at"),
            DocumentChunk.id.label("chunk_id"),
        )
        .join(ChatDocument, ChatDocument.document_id == Document.id)
        .outerjoin(DocumentChunk, DocumentChunk.document_id == Document.id)
        .filter(ChatDocument.chat_id == chat.id)
        .all()
    )
    document_map = {}
    for row in documents:
        item = document_map.setdefault(
            row.id,
            {
                "id": row.id,
                "name": row.name,
                "investor_id": row.investor_id,
                "created_at": row.created_at,
                "chunk_count": 0,
            },
        )
        if row.chunk_id is not None:
            item["chunk_count"] += 1

    return {
        "id": chat.id,
        "title": chat.title,
        "created_at": chat.created_at,
        "messages": chat.messages,
        "documents": list(document_map.values()),
    }


@router.post("/{chat_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def add_message(
    chat_id: UUID,
    body: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found.")

    if body.role not in ("user", "assistant"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="role must be 'user' or 'assistant'.",
        )

    message = ChatMessage(chat_id=chat_id, role=body.role, content=body.content)
    db.add(message)

    if chat.title is None and body.role == "user":
        chat.title = body.content[:60]

    db.commit()
    db.refresh(message)
    return message


@router.post(
    "/{chat_id}/documents",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def attach_document(
    chat_id: UUID,
    file: UploadFile = File(...),
    investor_id: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found.")

    if is_supported_audio_upload(file.content_type, file.filename):
        raw_bytes = await file.read()
        if not raw_bytes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Audio file is empty.",
            )
        transcript = transcribe_audio_bytes(raw_bytes, file.filename)
        if not transcript:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No speech could be transcribed from this recording.",
            )
        document, chunk_count = ingest_text_document(
            db=db,
            name=f"{file.filename or 'recording'} transcript",
            text=transcript,
            mime_type=file.content_type or "audio/*",
            file_data=raw_bytes,
            investor_id=investor_id,
        )
        db.add(DocumentTranscript(document_id=document.id, content=transcript))
    else:
        document, chunk_count = await ingest_pdf_document(
            db=db,
            file=file,
            investor_id=investor_id,
        )
    db.add(ChatDocument(chat_id=chat.id, document_id=document.id))
    db.commit()
    db.refresh(document)

    return DocumentUploadResponse(
        id=document.id,
        name=document.name,
        investor_id=document.investor_id,
        chunk_count=chunk_count,
        created_at=document.created_at,
    )


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(
    chat_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found.")
    db.delete(chat)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
