import os
from typing import List, Optional
from uuid import UUID

import google.generativeai as genai
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document, DocumentChunk
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.embedding import generate_embedding

router = APIRouter(tags=["ai"])

_TOP_K = 8

# Configure Gemini once at import time
genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))


def get_gemini_model() -> genai.GenerativeModel:
    """Return a GenerativeModel, falling back to the -latest alias on error."""
    try:
        return genai.GenerativeModel("gemini-1.5-flash")
    except Exception:
        return genai.GenerativeModel("gemini-1.5-flash-latest")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AIQueryRequest(BaseModel):
    query: str
    document_ids: Optional[List[UUID]] = None


class AIQueryResponse(BaseModel):
    answer: str
    sources: List[str]


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/query", response_model=AIQueryResponse)
def ai_query(
    body: AIQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.query.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="query must not be empty",
        )

    # ── 1. Embed the query ────────────────────────────────────────────────────
    try:
        query_vec = generate_embedding(body.query.strip())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Embedding generation failed: {exc}",
        )

    # ── 2. Vector search ──────────────────────────────────────────────────────
    cosine_distance = DocumentChunk.embedding.op("<=>")(query_vec)

    q = (
        db.query(DocumentChunk, Document.name.label("document_name"))
        .join(Document, DocumentChunk.document_id == Document.id)
        .filter(DocumentChunk.embedding.is_not(None))
    )

    if body.document_ids:
        q = q.filter(Document.id.in_(body.document_ids))

    rows = q.order_by(cosine_distance).limit(_TOP_K).all()

    # ── 3. No context case ────────────────────────────────────────────────────
    if not rows:
        return AIQueryResponse(
            answer="No relevant documents were found. Please upload documents or adjust your selection.",
            sources=[],
        )

    context = "\n\n".join(chunk.content for chunk, _ in rows)
    sources = list(set(doc_name for _, doc_name in rows))

    # ── 4. Call Gemini ────────────────────────────────────────────────────────
    if not os.getenv("GEMINI_API_KEY", ""):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured. Set GEMINI_API_KEY in your environment.",
        )

    prompt = f"""You are an AI assistant helping analyze investor documents.

Use ONLY the provided context.
If the answer is not in the context, say you don't know.

Context:
{context}

Question:
{body.query.strip()}

Instructions:
- Be concise and clear
- Use bullet points if useful
- Reference specific facts from context
"""

    try:
        model = get_gemini_model()
        response = model.generate_content(prompt)
        answer = getattr(response, "text", None) or "No response generated."
    except Exception as exc:
        print("Gemini error:", str(exc))
        answer = "AI generation failed. Please try again."

    return AIQueryResponse(answer=answer, sources=sources)
