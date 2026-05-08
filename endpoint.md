# Grant Pilot API Endpoints

Base URL during local development:

```text
http://127.0.0.1:8000
```

Most endpoints require a bearer token:

```http
Authorization: Bearer <access_token>
```

Public endpoints:

- `GET /`
- `POST /api/auth/login`
- `POST /api/auth/register`

All other endpoints are authenticated.

## Endpoint Summary

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Health/root message. |
| `POST` | `/api/auth/register` | Create a user account. |
| `POST` | `/api/auth/login` | Authenticate and return a bearer token. |
| `GET` | `/api/auth/me` | Return the current authenticated user. |
| `GET` | `/api/users` | List assignable users. |
| `GET` | `/api/investors` | List all investors. |
| `POST` | `/api/investors` | Create an investor. |
| `GET` | `/api/investors/stages` | Return canonical investor pipeline stages. |
| `GET` | `/api/investors/{investor_id}` | Return investor detail. |
| `PUT` | `/api/investors/{investor_id}` | Update investor detail. |
| `GET` | `/api/investors/{investor_id}/notes` | List notes for one investor. |
| `POST` | `/api/notes` | Create an investor note. |
| `GET` | `/api/interactions` | List interactions for an investor. |
| `POST` | `/api/interactions` | Create an interaction. |
| `GET` | `/api/documents` | List uploaded documents. |
| `POST` | `/api/documents/upload` | Upload and ingest a PDF. |
| `POST` | `/api/documents/search` | Semantic vector search over document chunks. |
| `GET` | `/api/documents/{document_id}/download` | Download/open original file bytes. |
| `GET` | `/api/documents/{document_id}/transcript` | Return stored transcript or chunk fallback. |
| `DELETE` | `/api/documents/{document_id}` | Delete a document and its chunks. |
| `GET` | `/api/chats` | List current user's chats. |
| `POST` | `/api/chats` | Create a chat. |
| `GET` | `/api/chats/{chat_id}` | Return chat messages and attached documents. |
| `DELETE` | `/api/chats/{chat_id}` | Delete a chat. |
| `POST` | `/api/chats/{chat_id}/messages` | Persist a user or assistant chat message. |
| `POST` | `/api/chats/{chat_id}/documents` | Attach and ingest PDF/audio into a chat. |
| `POST` | `/api/audio/transcribe` | Transcribe audio and save it as a RAG document. |
| `POST` | `/api/audio/speech-to-text` | Transcribe audio for voice dictation only. |
| `POST` | `/api/ai/query` | Non-streaming AI answer. |
| `POST` | `/api/ai/query/stream` | Streaming AI answer over server-sent events. |

## Auth Endpoints

### `POST /api/auth/register`

Creates a user.

Request body:

```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "name": "User Name",
  "role": "member"
}
```

Notes:

- `role` can be `head` or `member`.
- Email must be unique.
- Password is stored as a hash.

Response:

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "role": "member"
}
```

### `POST /api/auth/login`

Authenticates a user and returns a JWT bearer token.

Request body:

```json
{
  "email": "priya.sharma@grantpilot.com",
  "password": "Password123!"
}
```

Response:

```json
{
  "access_token": "jwt-token",
  "token_type": "bearer"
}
```

### `GET /api/auth/me`

Returns the current authenticated user.

Response:

```json
{
  "id": "uuid",
  "email": "priya.sharma@grantpilot.com",
  "name": "Priya Sharma",
  "role": "head"
}
```

## User Endpoints

### `GET /api/users`

Lists users who can be assigned as investor owners.

Used by:

- Investor add/edit form.
- Investor assigned-user filter.

Response:

```json
[
  {
    "id": "uuid",
    "email": "priya.sharma@grantpilot.com",
    "name": "Priya Sharma",
    "role": "head"
  }
]
```

## Investor Endpoints

### `GET /api/investors`

Returns investor summary records, including primary owner data.

Response item:

```json
{
  "id": "uuid",
  "name": "Ananya Mehta",
  "stage": "initial",
  "organization": "VentureCap India",
  "ask_amount": 100000,
  "primary_owner_id": "uuid",
  "primary_owner": {
    "id": "uuid",
    "name": "Priya Sharma",
    "email": "priya.sharma@grantpilot.com",
    "role": "head"
  }
}
```

### `POST /api/investors`

Creates an investor. If `primary_owner_id` is omitted, the backend assigns the current user.

Request body:

```json
{
  "name": "New Investor",
  "stage": "cold",
  "primary_owner_id": "uuid",
  "organization": "Example Fund",
  "email": "person@example.com",
  "capacity": 500000,
  "ask_amount": 100000,
  "interests": ["education", "climate"]
}
```

Validation:

- `stage` must be one of the canonical stages.
- `primary_owner_id`, when supplied, must reference a real user.

### `GET /api/investors/stages`

Returns canonical pipeline stage metadata.

Response:

```json
[
  {
    "key": "cold",
    "label": "Cold",
    "short_label": "Cold",
    "order": 0
  }
]
```

Canonical stage keys:

- `cold`
- `initial`
- `proposal`
- `visit_campus`
- `verbal_commitment`
- `mou`
- `draw_down_1`
- `draw_down_2`
- `draw_down_3`
- `draw_down_4`

### `GET /api/investors/{investor_id}`

Returns full investor detail, including notes and primary owner.

### `PUT /api/investors/{investor_id}`

Partially updates an investor.

Request body can include any subset of:

```json
{
  "name": "Updated Investor",
  "stage": "proposal",
  "primary_owner_id": "uuid",
  "organization": "Updated Org",
  "email": "updated@example.com",
  "capacity": 1000000,
  "ask_amount": 250000,
  "interests": ["edtech"]
}
```

## Notes and Interactions

### `GET /api/investors/{investor_id}/notes`

Lists notes for a specific investor.

### `POST /api/notes`

Creates a note and sets `created_by` to the authenticated user.

Request body:

```json
{
  "investor_id": "uuid",
  "content": "Follow up next week."
}
```

### `GET /api/interactions?investor_id={investor_id}`

Lists interactions for one investor.

### `POST /api/interactions`

Creates an interaction record.

Request body:

```json
{
  "investor_id": "uuid",
  "type": "meeting",
  "title": "Intro call",
  "description": "Discussed proposal timeline."
}
```

## Document and RAG Endpoints

### `GET /api/documents`

Returns all documents with investor name and chunk count.

Response item:

```json
{
  "id": "uuid",
  "name": "pitch.pdf",
  "investor_id": "uuid",
  "investor_name": "Ananya Mehta",
  "created_at": "2026-05-08T00:00:00Z",
  "chunk_count": 12
}
```

### `POST /api/documents/upload`

Uploads a PDF, extracts text, chunks it, embeds each chunk, stores the original bytes, and links it to an investor if `investor_id` is supplied.

Request type:

```text
multipart/form-data
file: PDF
investor_id: optional UUID
```

Response:

```json
{
  "id": "uuid",
  "name": "pitch.pdf",
  "investor_id": "uuid",
  "chunk_count": 12,
  "created_at": "2026-05-08T00:00:00Z"
}
```

### `POST /api/documents/search`

Runs semantic search over `document_chunks.embedding` using pgvector cosine distance.

Request body:

```json
{
  "query": "education funding priorities",
  "investor_id": "optional-uuid"
}
```

Response item:

```json
{
  "content": "Matched chunk text...",
  "document_id": "uuid",
  "document_name": "pitch.pdf",
  "score": 0.81
}
```

Implementation notes:

- Query is embedded with `sentence-transformers/all-MiniLM-L6-v2`.
- Chunks are ranked by pgvector `<=>` cosine distance.
- Returns top 5 matches.

### `GET /api/documents/{document_id}/download`

Streams original file bytes back to the browser.

Used for:

- Opening PDFs.
- Playing/downloading audio.

### `GET /api/documents/{document_id}/transcript`

Returns the saved transcript from `document_transcripts`. If no full transcript row exists, it falls back to joining `document_chunks` in chunk order.

### `DELETE /api/documents/{document_id}`

Deletes a document. Related chunks are removed by cascade.

## Chat Endpoints

### `GET /api/chats`

Lists chats belonging to the authenticated user.

### `POST /api/chats`

Creates a chat.

Request body:

```json
{
  "title": "New chat"
}
```

### `GET /api/chats/{chat_id}`

Returns chat detail with messages and attached/referenced documents.

Response shape:

```json
{
  "id": "uuid",
  "title": "New chat",
  "created_at": "2026-05-08T00:00:00Z",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Question",
      "created_at": "2026-05-08T00:00:00Z"
    }
  ],
  "documents": [
    {
      "id": "uuid",
      "name": "pitch.pdf",
      "investor_id": "uuid",
      "chunk_count": 12,
      "created_at": "2026-05-08T00:00:00Z"
    }
  ]
}
```

### `POST /api/chats/{chat_id}/messages`

Persists a user or assistant message.

Request body:

```json
{
  "role": "user",
  "content": "Tell me about this investor."
}
```

### `POST /api/chats/{chat_id}/documents`

Attaches a PDF or audio file to a chat and ingests it into RAG.

Request type:

```text
multipart/form-data
file: PDF or supported audio file
investor_id: optional UUID
```

Behavior:

- PDFs are parsed and embedded.
- Audio is transcribed, saved to `document_transcripts`, chunked, embedded, and stored.
- A `chat_documents` row links the file to the chat.

### `DELETE /api/chats/{chat_id}`

Deletes a chat and its messages/chat-document links.

## Audio Endpoints

### `POST /api/audio/transcribe`

Transcribes an audio recording and saves it as a RAG document.

Request type:

```text
multipart/form-data
file: supported audio file
investor_id: optional UUID
```

Response:

```json
{
  "id": "uuid",
  "name": "recording.mp3 transcript",
  "document_id": "uuid",
  "transcript": "Full transcript text...",
  "chunk_count": 7,
  "created_at": "2026-05-08T00:00:00Z"
}
```

### `POST /api/audio/speech-to-text`

Transcribes an audio blob for voice dictation only. It does not create a document and does not add chunks to RAG.

Request type:

```text
multipart/form-data
file: browser recording
```

Response:

```json
{
  "transcript": "Text from the recording."
}
```

## AI Endpoints

There are two physical AI endpoints and four logical AI modes.

Physical AI endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/ai/query` | Non-streaming AI response. |
| `POST` | `/api/ai/query/stream` | Streaming AI response via server-sent events. |

Logical AI modes:

| Mode | Trigger in UI | Purpose | RAG | Web search |
|---|---|---|---|---|
| `general` | Default chat | General LLM assistant with Grant Pilot context when available. | Yes, when available | Yes |
| `research` | `/research` | Investor/person/funder research. | Optional internal context | Yes |
| `proposal` | `/proposal` | Proposal drafting assistant. | Optional internal context | Yes |
| `infer` | `/infer` | Strict document-grounded Q&A. | Required | No |

### `POST /api/ai/query`

Request body:

```json
{
  "query": "Tell me about this investor.",
  "document_ids": ["optional-document-uuid"],
  "mode": "general",
  "chat_id": "optional-chat-uuid"
}
```

Response:

```json
{
  "answer": "AI-generated answer.",
  "sources": ["document.pdf"]
}
```

Behavior:

- Validates non-empty query.
- Generates query embedding when retrieval is needed.
- Retrieves top matching document chunks.
- Builds a prompt based on `mode`.
- Calls Venice/Grok chat completions.
- Enables web search for `general`, `research`, and `proposal`.
- If `chat_id` is provided, retrieved source documents are attached to the chat through `chat_documents`.

### `POST /api/ai/query/stream`

Request body is the same as `/api/ai/query`.

Response type:

```text
text/event-stream
```

Events:

```text
event: sources
data: {"sources":["document.pdf"]}

event: delta
data: {"text":"partial response text"}

event: done
data: {}
```

Used by the AI Assistant for live token-by-token response rendering.

## AI Prompt Locations

The AI prompt templates live in:

```text
backend/app/routers/ai.py
```

Function:

```text
build_prompt(mode, query, context, has_context)
```

Prompt behavior:

- `general`: acts like a modern LLM, uses retrieved Grant Pilot context when available.
- `proposal`: drafts a structured proposal and clearly labels assumptions.
- `research`: uses web search for investor/funder/person research.
- `infer`: uses only retrieved document context and says it does not know when context is missing.

## Database Tables Behind Endpoints

| Table | Used by | Purpose |
|---|---|---|
| `users` | Auth, assignment, settings | Stores user identity, password hash, and role. |
| `investors` | Investor CRM | Stores investor profile and stage. |
| `notes` | Investor profile | Stores investor notes and author. |
| `interactions` | Investor profile | Stores calls, meetings, emails, and other logs. |
| `documents` | Documents, RAG, chat | Stores file metadata, raw file bytes, and investor link. |
| `document_chunks` | RAG search, AI | Stores text chunks and pgvector embeddings. |
| `document_transcripts` | Audio | Stores full audio transcripts. |
| `chats` | AI Assistant | Stores user chat sessions. |
| `chat_messages` | AI Assistant | Stores user and assistant messages. |
| `chat_documents` | AI Assistant, RAG visibility | Links chats to attached or referenced documents. |

## External Services

| Service | Used for | Configuration |
|---|---|---|
| Venice/Grok-compatible chat completions | AI answers and streaming | `VENICE_API_KEY`, `VENICE_CHAT_MODEL` |
| Sentence Transformers | Local embeddings | `all-MiniLM-L6-v2` |
| pgvector | Vector similarity search | Postgres `vector` extension |
| faster-whisper | Audio transcription | Local Python dependency |
