from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import DocumentTranscript
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.audio import AudioTranscriptionResponse, SpeechToTextResponse
from app.services.audio_transcription import is_supported_audio_upload, transcribe_audio_bytes
from app.services.document_ingestion import ingest_text_document

router = APIRouter(prefix="/api/audio", tags=["audio"])


async def _read_supported_audio(file: UploadFile) -> bytes:
    if not is_supported_audio_upload(file.content_type, file.filename):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only audio recordings are accepted.",
        )

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Audio file is empty.",
        )

    return raw_bytes


def _transcribe_or_422(raw_bytes: bytes, filename: str | None) -> str:
    transcript = transcribe_audio_bytes(raw_bytes, filename)
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No speech could be transcribed from this recording.",
        )
    return transcript


@router.post("/speech-to-text", response_model=SpeechToTextResponse)
async def speech_to_text(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    raw_bytes = await _read_supported_audio(file)
    transcript = _transcribe_or_422(raw_bytes, file.filename)
    return SpeechToTextResponse(transcript=transcript)


@router.post("/transcribe", response_model=AudioTranscriptionResponse, status_code=status.HTTP_201_CREATED)
async def transcribe_audio(
    file: UploadFile = File(...),
    investor_id: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw_bytes = await _read_supported_audio(file)
    transcript = _transcribe_or_422(raw_bytes, file.filename)

    original_name = file.filename or "recording"
    document, chunk_count = ingest_text_document(
        db=db,
        name=f"{original_name} transcript",
        text=transcript,
        mime_type=file.content_type or "audio/*",
        file_data=raw_bytes,
        investor_id=investor_id,
    )
    db.add(DocumentTranscript(document_id=document.id, content=transcript))
    db.commit()
    db.refresh(document)

    return AudioTranscriptionResponse(
        id=document.id,
        name=document.name,
        document_id=document.id,
        transcript=transcript,
        chunk_count=chunk_count,
        created_at=document.created_at,
    )
