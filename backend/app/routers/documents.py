import io
import re
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile, File, status
from pypdf import PdfReader
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document, DocumentChunk
from app.models.investor import Investor
from app.models.user import User
from app.schemas.document import (
    DocumentChunkResult,
    DocumentListItem,
    DocumentSearchRequest,
    DocumentUploadResponse,
)
from app.services.embedding import generate_embedding
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/documents", tags=["documents"])

_TOP_K         = 5
_CHUNK_SIZE    = 500  # characters per chunk
_CHUNK_OVERLAP = 50   # characters of overlap between consecutive chunks


# ─── Private helpers ──────────────────────────────────────────────────────────

def _clean_text(text: str) -> str:
    """Strip null bytes and control characters from extracted PDF text."""
    if not text:
        return ""
    text = text.replace("\x00", "")
    text = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_text(file_bytes: bytes) -> str:
    """Extract all text pages from a PDF byte stream via pypdf."""
    reader = PdfReader(io.BytesIO(file_bytes))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text.strip())
    return "\n".join(parts)


def _chunk_text(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    """
    Split *text* into overlapping chunks of ~*size* characters.
    Boundaries are snapped to the nearest preceding whitespace to
    avoid cutting mid-word.
    """
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
    return [c for c in chunks if c and len(c) > 20]


# ─── List documents ───────────────────────────────────────────────────────────

@router.get("", response_model=list[DocumentListItem])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all documents with investor name and chunk count."""
    # Single query: join Investor (left), aggregate chunk count
    rows = (
        db.query(
            Document.id,
            Document.name,
            Document.created_at,
            Investor.name.label("investor_name"),
            func.count(DocumentChunk.id).label("chunk_count"),
        )
        .outerjoin(Investor, Document.investor_id == Investor.id)
        .outerjoin(DocumentChunk, DocumentChunk.document_id == Document.id)
        .group_by(Document.id, Investor.name)
        .order_by(Document.created_at.desc())
        .all()
    )

    return [
        DocumentListItem(
            id=row.id,
            name=row.name,
            investor_name=row.investor_name,
            created_at=row.created_at,
            chunk_count=row.chunk_count,
        )
        for row in rows
    ]


# ─── Upload document ──────────────────────────────────────────────────────────

@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    investor_id: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ingest a PDF:
    1. Validate investor exists (if provided).
    2. Extract + clean text with pypdf.
    3. Chunk into ~500-char overlapping segments.
    4. Embed each chunk and persist Document + DocumentChunk rows.
    5. Store raw PDF bytes for later download.
    """
    # ── 1. File type guard ────────────────────────────────────────────────────
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are accepted.",
        )

    # ── 2. Read raw bytes ─────────────────────────────────────────────────────
    raw_bytes = await file.read()

    # ── 3. Extract & clean text ───────────────────────────────────────────────
    try:
        text = _clean_text(_extract_text(raw_bytes))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse PDF: {exc}",
        )

    if not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="PDF contains no extractable text.",
        )

    # ── 4. Validate investor_id ───────────────────────────────────────────────
    parsed_investor_id: UUID | None = None
    if investor_id:
        try:
            parsed_investor_id = UUID(investor_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid investor_id.")

        exists = db.query(Investor.id).filter(Investor.id == parsed_investor_id).first()
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investor not found.")

    # ── 5. Persist Document row ───────────────────────────────────────────────
    document = Document(
        name=file.filename or "untitled.pdf",
        mime_type="application/pdf",
        file_data=raw_bytes,
        investor_id=parsed_investor_id,
    )
    db.add(document)
    db.flush()  # materialise document.id before chunk inserts

    # ── 6. Chunk → embed → persist chunks ────────────────────────────────────
    chunks = _chunk_text(text)
    for idx, chunk_text in enumerate(chunks):
        try:
            vec = generate_embedding(chunk_text)
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Embedding failed on chunk {idx}: {exc}",
            )
        db.add(DocumentChunk(
            document_id=document.id,
            chunk_index=idx,
            content=chunk_text,
            embedding=vec,
        ))

    db.commit()
    db.refresh(document)

    return DocumentUploadResponse(
        id=document.id,
        name=document.name,
        investor_id=document.investor_id,
        chunk_count=len(chunks),
        created_at=document.created_at,
    )


# ─── Delete document ──────────────────────────────────────────────────────────

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a document. Chunks are removed automatically via CASCADE."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    db.delete(document)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── Download document ────────────────────────────────────────────────────────

@router.get("/{document_id}/download")
def download_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream the original PDF bytes back to the client."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if not document.file_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File data not available.")

    return Response(
        content=document.file_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{document.name}"'},
    )


# ─── Vector search ────────────────────────────────────────────────────────────

@router.post("/search", response_model=list[DocumentChunkResult])
def search_documents(
    body: DocumentSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Semantic search over document chunks using pgvector cosine similarity.
    Optionally scoped to a single investor. Returns top-5 results.
    """
    if not body.query.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="query must not be empty",
        )

    # ── 1. Embed query ────────────────────────────────────────────────────────
    try:
        query_vec = generate_embedding(body.query.strip())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Embedding generation failed: {exc}",
        )

    # ── 2. Cosine similarity query ────────────────────────────────────────────
    # <=> = pgvector cosine-distance operator, range [0, 2].
    # score = 1 - distance/2  →  range [0, 1], higher is more relevant.
    cosine_distance = DocumentChunk.embedding.op("<=>")(query_vec)

    q = (
        db.query(
            DocumentChunk,
            Document.name.label("document_name"),
            (1 - cosine_distance / 2).label("score"),
        )
        .join(Document, DocumentChunk.document_id == Document.id)
        .filter(DocumentChunk.embedding.is_not(None))
    )

    if body.investor_id is not None:
        q = q.filter(Document.investor_id == body.investor_id)

    rows = q.order_by(cosine_distance).limit(_TOP_K).all()

    # ── 3. Shape response ─────────────────────────────────────────────────────
    return [
        DocumentChunkResult(
            content=chunk.content,
            document_id=chunk.document_id,
            document_name=document_name,
            score=round(float(score), 6),
        )
        for chunk, document_name, score in rows
    ]
