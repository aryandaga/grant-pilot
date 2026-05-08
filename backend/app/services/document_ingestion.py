import io
import re
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentChunk
from app.models.investor import Investor
from app.services.embedding import generate_embedding

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def clean_pdf_text(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\x00", "")
    text = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_pdf_text(file_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(file_bytes))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text.strip())
    return "\n".join(parts)


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + size
        if end >= len(text):
            chunks.append(text[start:].strip())
            break
        boundary = text.rfind(" ", start, end)
        if boundary == -1:
            boundary = end
        chunks.append(text[start:boundary].strip())
        start = boundary - overlap
    return [chunk for chunk in chunks if chunk and len(chunk) > 20]


def parse_investor_id(db: Session, investor_id: str | None) -> UUID | None:
    if not investor_id:
        return None

    try:
        parsed_investor_id = UUID(investor_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid investor_id.",
        ) from exc

    exists = db.query(Investor.id).filter(Investor.id == parsed_investor_id).first()
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investor not found.")

    return parsed_investor_id


def ingest_text_document(
    *,
    db: Session,
    name: str,
    text: str,
    mime_type: str,
    file_data: bytes | None = None,
    investor_id: str | None = None,
) -> tuple[Document, int]:
    cleaned_text = re.sub(r"\s+", " ", text.replace("\x00", " ")).strip()
    if not cleaned_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Document contains no extractable text.",
        )

    document = Document(
        name=name,
        mime_type=mime_type,
        file_data=file_data,
        investor_id=parse_investor_id(db, investor_id),
    )
    db.add(document)
    db.flush()

    chunks = chunk_text(cleaned_text)
    for idx, chunk_content in enumerate(chunks):
        try:
            vec = generate_embedding(chunk_content)
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Embedding failed on chunk {idx}: {exc}",
            ) from exc
        db.add(
            DocumentChunk(
                document_id=document.id,
                chunk_index=idx,
                content=chunk_content,
                embedding=vec,
            )
        )

    return document, len(chunks)


async def ingest_pdf_document(
    *,
    db: Session,
    file: UploadFile,
    investor_id: str | None = None,
) -> tuple[Document, int]:
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are accepted.",
        )

    raw_bytes = await file.read()

    try:
        text = clean_pdf_text(extract_pdf_text(raw_bytes))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse PDF: {exc}",
        ) from exc

    if not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="PDF contains no extractable text.",
        )

    return ingest_text_document(
        db=db,
        name=file.filename or "untitled.pdf",
        text=text,
        mime_type="application/pdf",
        file_data=raw_bytes,
        investor_id=investor_id,
    )
