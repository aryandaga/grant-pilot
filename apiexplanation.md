# Grant Pilot — API Endpoint Reference

All endpoints are served from the FastAPI backend (`backend/app/`). Every endpoint except `POST /api/auth/register` and `POST /api/auth/login` requires a valid JWT bearer token in the `Authorization` header.

---

## Authentication
**Router file:** `backend/app/routers/auth.py`  
**Router prefix:** `/api/auth`

---

### `POST /api/auth/register`
Creates a new user account. Accepts `email`, `password`, `name`, and `role`. Hashes the password with bcrypt before storing. Returns the created user object with a `201 Created` status. No authentication required.

---

### `POST /api/auth/login`
Authenticates an existing user. Accepts `email` and `password`, verifies the bcrypt hash, and returns a signed JWT access token valid for 24 hours. No authentication required.

---

### `GET /api/auth/me`
Returns the profile of the currently authenticated user — `id`, `email`, `name`, and `role` — decoded from the bearer token.

---

## Investors
**Router file:** `backend/app/routers/investors.py`  
**Router prefix:** `/api/investors`

---

### `GET /api/investors`
Returns a list of all investors in the database, ordered alphabetically by name. Each item is a lightweight summary containing `id`, `name`, `stage`, `organization`, and `ask_amount`.

---

### `GET /api/investors/{investor_id}`
Returns the full profile of a single investor by UUID, including all nested notes. Returns `404` if the investor does not exist.

---

### `POST /api/investors`
Creates a new investor record. Accepts `name`, `stage`, `organization`, `email`, `capacity`, `ask_amount`, and `interests`. Returns the full investor detail with a `201 Created` status.

---

### `PUT /api/investors/{investor_id}`
Partially updates an existing investor. Only fields included in the request body are written — unset fields are left unchanged. Uses `model_dump(exclude_unset=True)` internally. Returns the updated investor detail. Returns `404` if the investor does not exist.

---

## Notes
**Router file:** `backend/app/routers/notes.py`  
**Router prefix:** `/api`

---

### `GET /api/investors/{investor_id}/notes`
Returns all notes for a given investor, ordered newest first. Returns `404` if the investor does not exist.

---

### `POST /api/notes`
Creates a note for a specified investor. Accepts `investor_id` and `content`. Automatically sets `created_by` to the authenticated user's ID. Returns the created note with a `201 Created` status.

---

## Interactions
**Router file:** `backend/app/routers/interactions.py`  
**Router prefix:** `/api`

---

### `GET /api/interactions`
Returns all interaction logs for a given investor. The investor is specified via `investor_id` as a query parameter (e.g. `/api/interactions?investor_id=<uuid>`). Ordered newest first.

---

### `POST /api/interactions`
Logs a new interaction for an investor. Accepts `investor_id`, `type` (`call`, `meeting`, or `email`), `title`, and an optional `description`. Returns the created interaction with a `201 Created` status.

---

## Documents
**Router file:** `backend/app/routers/documents.py`  
**Router prefix:** `/api/documents`

---

### `GET /api/documents`
Returns a list of all uploaded documents, each with `id`, `name`, `investor_name` (joined from the investors table), `created_at`, and `chunk_count`. Ordered newest first.

---

### `POST /api/documents/upload`
Ingests a PDF file. Accepts a `multipart/form-data` request with the file and an optional `investor_id` field. Pipeline: validates the investor exists if an ID is given → extracts text with pypdf → cleans and chunks the text into ~500-character overlapping segments → generates a 384-dimensional sentence-transformer embedding per chunk → persists the `Document` row and all `DocumentChunk` rows. Returns document metadata and chunk count with a `201 Created` status.

---

### `DELETE /api/documents/{document_id}`
Deletes a document by UUID. All associated chunks are removed automatically via `CASCADE`. Returns `204 No Content`. Returns `404` if the document does not exist.

---

### `GET /api/documents/{document_id}/download`
Streams the original PDF bytes back to the client with `Content-Type: application/pdf`. The raw file bytes are stored in the `file_data` column of the `documents` table. Returns `404` if the document or its file data does not exist.

---

### `POST /api/documents/search`
Performs semantic vector search over all stored document chunks using pgvector's cosine distance operator (`<=>`). Accepts a `query` string and an optional `investor_id` to scope results. Embeds the query with the same sentence-transformer model used at upload time, then returns the top 5 most similar chunks with their content, document name, and similarity score (0–1).

---

## AI / RAG
**Router file:** `backend/app/routers/ai.py`  
**Router prefix:** `/api/ai`

---

### `POST /api/ai/query`
The core RAG endpoint. Accepts a `query` string and an optional list of `document_ids` to scope the search. Pipeline: embeds the query → retrieves the top 8 most semantically similar document chunks (filtered to the specified documents if provided) → constructs a context-aware prompt → calls the Gemini API using `genai.list_models()` to dynamically select a valid model supported by the configured API key (preferring flash variants) → returns the generated `answer` and a list of `sources` (unique document names that contributed context). Returns `503` if `GEMINI_API_KEY` is not set. Returns a graceful error message string if Gemini generation fails rather than raising an HTTP error.

---

## Chats
**Router file:** `backend/app/routers/chats.py`  
**Router prefix:** `/api/chats`

---

### `POST /api/chats`
Creates a new empty chat for the authenticated user. Accepts an optional `title`. Returns the created chat with a `201 Created` status.

---

### `GET /api/chats`
Returns all chats belonging to the authenticated user, ordered newest first. Each item contains `id`, `title`, and `created_at`. Does not include message content.

---

### `GET /api/chats/{chat_id}`
Returns the full detail of a single chat, including all messages in chronological order. Each message contains `id`, `role`, `content`, and `created_at`. Returns `404` if the chat does not exist or does not belong to the authenticated user.

---

### `POST /api/chats/{chat_id}/messages`
Appends a message to an existing chat. Accepts `role` (`"user"` or `"assistant"`) and `content`. If the chat has no title yet and the role is `"user"`, the title is automatically set to the first 60 characters of the message content. Returns the created message with a `201 Created` status. Returns `404` if the chat is not found or not owned by the user. Returns `422` if an invalid role is supplied.

---

### `DELETE /api/chats/{chat_id}`
Deletes a chat by UUID. All messages are removed automatically via `CASCADE DELETE` on the foreign key. Returns `204 No Content`. Returns `404` if the chat does not exist or does not belong to the authenticated user.
