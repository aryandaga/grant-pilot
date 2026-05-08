import json
import os
from typing import List, Literal, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.chat import Chat, ChatDocument
from app.models.document import Document, DocumentChunk
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.embedding import generate_embedding

router = APIRouter(tags=["ai"])

_TOP_K = 8
_VENICE_CHAT_URL = "https://api.venice.ai/api/v1/chat/completions"


class AIQueryRequest(BaseModel):
    query: str
    document_ids: Optional[List[UUID]] = None
    mode: Literal["general", "proposal", "research", "infer"] = "general"
    chat_id: Optional[UUID] = None


class AIQueryResponse(BaseModel):
    answer: str
    sources: List[str]


def attach_source_documents_to_chat(
    *,
    db: Session,
    chat_id: UUID | None,
    user_id: UUID,
    document_ids: list[UUID],
) -> None:
    if not chat_id or not document_ids:
        return

    chat = db.query(Chat.id).filter(Chat.id == chat_id, Chat.user_id == user_id).first()
    if not chat:
        return

    unique_document_ids = list(dict.fromkeys(document_ids))
    existing_ids = {
        row.document_id
        for row in db.query(ChatDocument.document_id)
        .filter(
            ChatDocument.chat_id == chat_id,
            ChatDocument.document_id.in_(unique_document_ids),
        )
        .all()
    }

    for document_id in unique_document_ids:
        if document_id not in existing_ids:
            db.add(ChatDocument(chat_id=chat_id, document_id=document_id))

    db.commit()


def generate_ai_answer(prompt: str, *, enable_web_search: bool = False) -> str:
    api_key = os.getenv("VENICE_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured. Set VENICE_API_KEY in your environment.",
        )

    payload = {
        "model": os.getenv("VENICE_CHAT_MODEL", "grok-41-fast"),
        "messages": [{"role": "user", "content": prompt}],
    }
    if enable_web_search:
        payload["venice_parameters"] = {
            "enable_web_search": "on",
            "include_search_results_in_stream": False,
        }
    request = Request(
        _VENICE_CHAT_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print("Venice API error:", detail)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI generation failed.",
        ) from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        print("Venice API error:", str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI generation failed.",
        ) from exc

    try:
        return data["choices"][0]["message"]["content"] or "No response generated."
    except (KeyError, IndexError, TypeError) as exc:
        print("Unexpected Venice response:", data)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned an unexpected response.",
        ) from exc


def stream_ai_answer(prompt: str, *, enable_web_search: bool = False):
    api_key = os.getenv("VENICE_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured. Set VENICE_API_KEY in your environment.",
        )

    payload = {
        "model": os.getenv("VENICE_CHAT_MODEL", "grok-41-fast"),
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
    }
    if enable_web_search:
        payload["venice_parameters"] = {
            "enable_web_search": "on",
            "include_search_results_in_stream": False,
        }

    request = Request(
        _VENICE_CHAT_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=90) as response:
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line or not line.startswith("data:"):
                    continue

                data_text = line.removeprefix("data:").strip()
                if data_text == "[DONE]":
                    break

                try:
                    data = json.loads(data_text)
                except json.JSONDecodeError:
                    continue

                delta = data.get("choices", [{}])[0].get("delta", {}).get("content")
                if delta:
                    yield delta
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print("Venice API stream error:", detail)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI generation failed.",
        ) from exc
    except (URLError, TimeoutError) as exc:
        print("Venice API stream error:", str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI generation failed.",
        ) from exc


def build_prompt(*, mode: str, query: str, context: str, has_context: bool) -> str:
    if mode == "general":
        context_note = (
            f"Relevant Grant Pilot document context:\n{context}\n\n"
            if has_context
            else "No Grant Pilot document context was retrieved for this request.\n\n"
        )
        return f"""You are Grant Pilot's general AI assistant.

Answer naturally and helpfully like a modern LLM. Use retrieved or attached Grant Pilot document context when available, but do not limit yourself to it unless the user asks you to.
If you use web/current knowledge, distinguish it from internal document context when the distinction matters.

{context_note}User request:
{query}
"""

    if mode == "proposal":
        context_note = (
            f"Relevant Grant Pilot document context:\n{context}\n\n"
            if has_context
            else "No Grant Pilot document context was retrieved. Use web research and the user's prompt, and clearly mark assumptions.\n\n"
        )
        return f"""You are Grant Pilot's proposal drafting assistant.

Draft a proposal based on the user's request. Use attached/retrieved Grant Pilot files when available, and use web research when documents are missing or incomplete.
Do not block just because no documents were found. Be useful like a general LLM, but clearly label assumptions and facts that need confirmation.

{context_note}User request:
{query}

Output structure:
- Proposal title
- Executive summary
- Need/opportunity
- Proposed initiative
- Alignment with investor priorities
- Funding request or next-step recommendation
- Missing information
"""

    if mode == "research":
        context_note = (
            f"Known internal context from Grant Pilot files:\n{context}\n\n"
            if has_context
            else "No internal Grant Pilot document context was retrieved for this request.\n\n"
        )
        return f"""You are Grant Pilot's investor research assistant.

Use web search to research the investor, funder, organization, or person in the user's request. Prefer current, specific, source-grounded details.

{context_note}Research request:
{query}

Output structure:
- Snapshot
- Relevant focus areas
- Recent signals or updates
- Fit for Grant Pilot
- Suggested outreach angle
- Sources or citations when available
"""

    return f"""You are an AI assistant helping analyze investor documents.

Use ONLY the provided document context.
If the answer is not in the context, say you don't know.

Document context:
{context}

Question:
{query}

Instructions:
- Be concise and clear
- Use bullet points if useful
- Reference specific facts from context
"""


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

    rows = []
    should_retrieve = body.mode in ("general", "infer") or bool(body.document_ids)
    if should_retrieve:
        try:
            query_vec = generate_embedding(body.query.strip())
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Embedding generation failed: {exc}",
            ) from exc

        cosine_distance = DocumentChunk.embedding.op("<=>")(query_vec)
        q = (
            db.query(DocumentChunk, Document.id.label("document_id"), Document.name.label("document_name"))
            .join(Document, DocumentChunk.document_id == Document.id)
            .filter(DocumentChunk.embedding.is_not(None))
        )

        if body.document_ids:
            q = q.filter(Document.id.in_(body.document_ids))

        rows = q.order_by(cosine_distance).limit(_TOP_K).all()

    if not rows and body.mode == "infer":
        return AIQueryResponse(
            answer="No relevant documents were found. Please upload documents or adjust your selection.",
            sources=[],
        )

    context = "\n\n".join(chunk.content for chunk, _, _ in rows) if rows else ""
    source_document_ids = list(dict.fromkeys(document_id for _, document_id, _ in rows))
    sources = list(dict.fromkeys(doc_name for _, _, doc_name in rows))
    attach_source_documents_to_chat(
        db=db,
        chat_id=body.chat_id,
        user_id=current_user.id,
        document_ids=source_document_ids,
    )
    prompt = build_prompt(
        mode=body.mode,
        query=body.query.strip(),
        context=context,
        has_context=bool(rows),
    )

    return AIQueryResponse(
        answer=generate_ai_answer(prompt, enable_web_search=body.mode in ("general", "proposal", "research")),
        sources=sources,
    )


@router.post("/query/stream")
def ai_query_stream(
    body: AIQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.query.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="query must not be empty",
        )

    rows = []
    should_retrieve = body.mode in ("general", "infer") or bool(body.document_ids)
    if should_retrieve:
        try:
            query_vec = generate_embedding(body.query.strip())
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Embedding generation failed: {exc}",
            ) from exc

        cosine_distance = DocumentChunk.embedding.op("<=>")(query_vec)
        q = (
            db.query(DocumentChunk, Document.id.label("document_id"), Document.name.label("document_name"))
            .join(Document, DocumentChunk.document_id == Document.id)
            .filter(DocumentChunk.embedding.is_not(None))
        )

        if body.document_ids:
            q = q.filter(Document.id.in_(body.document_ids))

        rows = q.order_by(cosine_distance).limit(_TOP_K).all()

    source_document_ids = list(dict.fromkeys(document_id for _, document_id, _ in rows))
    sources = list(dict.fromkeys(doc_name for _, _, doc_name in rows))
    attach_source_documents_to_chat(
        db=db,
        chat_id=body.chat_id,
        user_id=current_user.id,
        document_ids=source_document_ids,
    )
    if not rows and body.mode == "infer":
        def no_context_stream():
            message = "No relevant documents were found. Please upload documents or adjust your selection."
            yield f"event: sources\ndata: {json.dumps({'sources': []})}\n\n"
            yield f"event: delta\ndata: {json.dumps({'text': message})}\n\n"
            yield "event: done\ndata: {}\n\n"

        return StreamingResponse(no_context_stream(), media_type="text/event-stream")

    context = "\n\n".join(chunk.content for chunk, _, _ in rows) if rows else ""
    prompt = build_prompt(
        mode=body.mode,
        query=body.query.strip(),
        context=context,
        has_context=bool(rows),
    )

    def event_stream():
        yield f"event: sources\ndata: {json.dumps({'sources': sources})}\n\n"
        for delta in stream_ai_answer(prompt, enable_web_search=body.mode in ("general", "proposal", "research")):
            yield f"event: delta\ndata: {json.dumps({'text': delta})}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
