# Grant Pilot — Technical Reference

Grant Pilot is an AI-powered investor CRM built for institutional advancement teams. It manages investor relationships, logs interactions, stores documents, and provides semantic search over uploaded PDFs using vector embeddings.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Project Structure](#2-project-structure)
3. [Architecture Overview](#3-architecture-overview)
4. [Database & ORM](#4-database--orm)
5. [Data Models](#5-data-models)
6. [Pydantic Schemas](#6-pydantic-schemas)
7. [API Endpoints](#7-api-endpoints)
8. [Authentication System](#8-authentication-system)
9. [Embedding & Vector Search](#9-embedding--vector-search)
10. [Document Ingestion Pipeline](#10-document-ingestion-pipeline)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Pages & Screens](#12-pages--screens)
13. [API Client Layer](#13-api-client-layer)
14. [Design System](#14-design-system)
15. [Environment & Configuration](#15-environment--configuration)
16. [Running the Project](#16-running-the-project)

---

## 1. Tech Stack

### Backend

| Layer | Technology | Version / Notes |
|---|---|---|
| Framework | FastAPI | Async-capable, auto OpenAPI docs |
| ORM | SQLAlchemy | v2.0 style, declarative base |
| Database | PostgreSQL | v16, native Windows service |
| Vector extension | pgvector | `vector` column type, cosine distance |
| Validation | Pydantic v2 | `model_config = {"from_attributes": True}` |
| Authentication | python-jose | HS256 JWT, 24h expiry |
| Password hashing | bcrypt | Used directly (not via passlib) |
| PDF parsing | pypdf | Text extraction, page iteration |
| Embeddings | sentence-transformers | `all-MiniLM-L6-v2`, 384-dim vectors |
| CORS | FastAPI CORSMiddleware | Restricted to `http://localhost:5173` |

> **Why bcrypt directly?** `passlib` is incompatible with `bcrypt >= 4.0.0` due to a removed `__about__` attribute. The project bypasses passlib entirely and calls `bcrypt.hashpw` / `bcrypt.checkpw` directly.

### Frontend

| Layer | Technology | Notes |
|---|---|---|
| Framework | React 19 | Functional components, hooks only |
| Language | TypeScript | Strict mode, `noUnusedLocals`, `noUnusedParameters` |
| Build tool | Vite | Dev server on port 5173 |
| Routing | react-router-dom v6 | `BrowserRouter`, `Routes`, `Route`, `Navigate` |
| HTTP client | axios | Request interceptor auto-attaches Bearer token |
| CSS | Tailwind CSS (Play CDN) | Loaded via CDN script in `index.html` — no PostCSS |
| Icons | Material Symbols Outlined | Google Fonts CDN, variable font |
| Typography | Inter | Google Fonts CDN, weights 300–900 |

> **Why Tailwind CDN instead of PostCSS?** The project uses the Tailwind Play CDN with an inline `tailwind.config` script block. This avoids the PostCSS build setup and lets custom design tokens be configured directly in `index.html`.

---

## 2. Project Structure

```
AIPD_New/
├── docker-compose.yml
├── README.md
│
├── backend/
│   ├── main.py                     # Minimal root entry (unused in dev)
│   └── app/
│       ├── __init__.py
│       ├── main.py                 # FastAPI app, CORS, router registration, create_all
│       ├── database.py             # Engine, SessionLocal, Base, get_db()
│       ├── seed.py                 # Seed data script
│       │
│       ├── models/
│       │   ├── __init__.py         # Imports all models (registers with Base)
│       │   ├── user.py
│       │   ├── investor.py
│       │   ├── note.py
│       │   ├── interaction.py
│       │   └── document.py         # Document + DocumentChunk
│       │
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── auth.py
│       │   ├── investor.py
│       │   ├── note.py
│       │   ├── interaction.py
│       │   └── document.py
│       │
│       ├── routers/
│       │   ├── __init__.py
│       │   ├── auth.py             # Also exports get_current_user dependency
│       │   ├── investors.py
│       │   ├── notes.py
│       │   ├── interactions.py
│       │   └── documents.py
│       │
│       └── services/
│           ├── __init__.py
│           ├── auth_service.py     # JWT encode/decode, bcrypt hashing
│           └── embedding.py        # sentence-transformers wrapper
│
└── frontend/
    ├── index.html                  # Tailwind CDN, config, fonts, Material Symbols
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx                # ReactDOM.createRoot entry point
        ├── App.tsx                 # Router, auth guard, route definitions
        ├── index.css               # Global resets, scrollbar utils, ghost-border
        │
        ├── api/
        │   ├── client.ts           # axios instance + auth interceptor
        │   ├── auth.ts             # login()
        │   ├── investors.ts        # getInvestors()
        │   └── documents.ts        # getDocuments, upload, delete, search, blobUrl
        │
        └── pages/
            ├── Login.tsx
            ├── Investors.tsx
            ├── InvestorDetail.tsx
            └── Documents.tsx
```

---

## 3. Architecture Overview

```
Browser (localhost:5173)
        │
        │  axios + Bearer token
        ▼
FastAPI (localhost:8000)
        │
        ├── /api/auth/*         JWT auth, bcrypt passwords
        ├── /api/investors/*    CRUD investors
        ├── /api/notes/*        Notes per investor
        ├── /api/interactions/* Interaction timeline
        └── /api/documents/*    Upload, list, delete, download, search
                │
                ├── PostgreSQL (localhost:5432)
                │       ├── users
                │       ├── investors
                │       ├── notes
                │       ├── interactions
                │       ├── documents           (+ LargeBinary file_data)
                │       └── document_chunks     (+ pgvector embedding)
                │
                └── sentence-transformers
                        └── all-MiniLM-L6-v2   (384-dim, loaded at startup)
```

**Request lifecycle:**
1. Vite dev server serves the React SPA.
2. Every axios request goes through the request interceptor which reads `token` from `localStorage` and sets `Authorization: Bearer <token>`.
3. FastAPI validates the token via `get_current_user`, a reusable `Depends()` used on every protected route.
4. The route handler queries PostgreSQL via SQLAlchemy and returns a Pydantic-serialised response.

---

## 4. Database & ORM

**File:** `backend/app/database.py`

```python
DATABASE_URL = "postgresql://postgres:password@localhost:5432/grantpilot"

engine      = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base        = declarative_base()

def get_db():          # FastAPI dependency
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**Key decisions:**
- `autocommit=False` — all writes require explicit `db.commit()`.
- `autoflush=False` — prevents SQLAlchemy from auto-flushing before every query, giving explicit control.
- `Base.metadata.create_all(bind=engine)` is called in `app/main.py` on startup — all tables are created automatically if they don't exist. **No migrations.**
- All models import `Base` from `database.py`. All models are imported in `models/__init__.py` to ensure they register with `Base` before `create_all` runs.

**pgvector setup (manual, one-time):**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 5. Data Models

### 5.1 User

**File:** `backend/app/models/user.py`  
**Table:** `users`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `email` | String | unique, not null, indexed |
| `hashed_password` | String | not null |
| `name` | String | not null |
| `role` | Enum (UserRole) | not null, default `member` |

**UserRole enum:** `head` | `member`

---

### 5.2 Investor

**File:** `backend/app/models/investor.py`  
**Table:** `investors`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `name` | String | not null |
| `stage` | String | not null — e.g. `"seed"`, `"series_a"`, `"grant"` |
| `capacity` | Float | nullable — total investment capacity (USD) |
| `ask_amount` | Float | nullable — amount requested from this investor |
| `interests` | ARRAY(Text) | nullable — list of sector focus areas |
| `email` | String | nullable |
| `organization` | String | nullable |

**Backref relationships:** `notes`, `interactions`, `documents` (all added via backref on child models).

---

### 5.3 Note

**File:** `backend/app/models/note.py`  
**Table:** `notes`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `investor_id` | UUID | FK → `investors.id`, not null |
| `content` | Text | not null |
| `created_by` | UUID | FK → `users.id`, nullable |
| `created_at` | DateTime(tz) | server default `now()` |

**Relationships:** `investor` (→ Investor), `author` (→ User)

---

### 5.4 Interaction

**File:** `backend/app/models/interaction.py`  
**Table:** `interactions`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `investor_id` | UUID | FK → `investors.id`, not null |
| `type` | String | not null — `"call"` \| `"meeting"` \| `"email"` |
| `title` | String | not null |
| `description` | Text | nullable |
| `created_at` | DateTime(tz) | server default `now()` |

**Relationships:** `investor` (→ Investor)

---

### 5.5 Document

**File:** `backend/app/models/document.py`  
**Table:** `documents`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `investor_id` | UUID | FK → `investors.id`, nullable |
| `name` | String | not null — original filename |
| `mime_type` | String | nullable |
| `file_data` | LargeBinary | nullable — raw PDF bytes |
| `created_at` | DateTime(tz) | server default `now()` |

**Relationships:** `investor` (→ Investor), `chunks` (→ DocumentChunk, cascade `all, delete-orphan`)

> `file_data` stores the original PDF bytes in the database. This enables the download endpoint to serve the file without a filesystem. Nullable so pre-existing rows without file data don't break.

---

### 5.6 DocumentChunk

**File:** `backend/app/models/document.py`  
**Table:** `document_chunks`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK, default uuid4 |
| `document_id` | UUID | FK → `documents.id` ON DELETE CASCADE, not null |
| `chunk_index` | Integer | not null — position within document |
| `content` | Text | not null — raw text of the chunk |
| `embedding` | Vector(384) | nullable — 384-dim float vector |
| `created_at` | DateTime(tz) | server default `now()` |

**Relationships:** `document` (→ Document)

**`ondelete="CASCADE"`** — deleting a `Document` row automatically removes all its `DocumentChunk` rows at the database level, independent of SQLAlchemy.

---

## 6. Pydantic Schemas

All schemas use Pydantic v2. Response schemas include `model_config = {"from_attributes": True}` to enable ORM mode (reading from SQLAlchemy model instances).

### Auth schemas (`schemas/auth.py`)

| Schema | Direction | Fields |
|---|---|---|
| `RegisterRequest` | Request | `email` (EmailStr), `password`, `name`, `role` (default: member) |
| `LoginRequest` | Request | `email` (EmailStr), `password` |
| `TokenResponse` | Response | `access_token`, `token_type` (default: "bearer") |
| `UserResponse` | Response | `id`, `email`, `name`, `role` |

### Investor schemas (`schemas/investor.py`)

| Schema | Direction | Fields |
|---|---|---|
| `InvestorCreate` | Request | `name`, `stage`, `organization?`, `email?`, `capacity?`, `ask_amount?`, `interests?` |
| `InvestorSummary` | Response (list) | `id`, `name`, `stage`, `organization?`, `ask_amount?` |
| `InvestorDetail` | Response (detail) | All fields + `notes: list[NoteResponse]` |

### Note schemas (`schemas/note.py`)

| Schema | Direction | Fields |
|---|---|---|
| `NoteCreate` | Request | `investor_id` (UUID), `content` |
| `NoteResponse` | Response | `id`, `investor_id`, `content`, `created_by?`, `created_at?` |

### Interaction schemas (`schemas/interaction.py`)

| Schema | Direction | Fields |
|---|---|---|
| `InteractionCreate` | Request | `investor_id` (UUID), `type`, `title`, `description` (default: "") |
| `InteractionResponse` | Response | `id`, `investor_id`, `type`, `title`, `description?`, `created_at?` |

### Document schemas (`schemas/document.py`)

| Schema | Direction | Fields |
|---|---|---|
| `DocumentSearchRequest` | Request | `query` (str), `investor_id?` (UUID) |
| `DocumentChunkResult` | Response | `content`, `document_id` (UUID), `document_name`, `score` (float) |
| `DocumentUploadResponse` | Response | `id`, `name`, `investor_id?`, `chunk_count`, `created_at?` |
| `DocumentListItem` | Response | `id`, `name`, `investor_name?`, `created_at?`, `chunk_count` |

---

## 7. API Endpoints

All endpoints except `POST /api/auth/register` and `POST /api/auth/login` require a valid JWT in the `Authorization: Bearer <token>` header.

Base URL: `http://localhost:8000`

---

### Auth — `/api/auth`

#### `POST /api/auth/register`
Register a new user.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "secret",
  "name": "Alice",
  "role": "member"
}
```
**Response:** `201` `UserResponse`  
**Errors:** `409` if email already registered

---

#### `POST /api/auth/login`
Authenticate and receive a JWT.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "secret"
}
```
**Response:** `200`
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```
**Errors:** `401` invalid credentials

---

#### `GET /api/auth/me`
Return the currently authenticated user.

**Auth:** required  
**Response:** `200` `UserResponse`

---

### Investors — `/api/investors`

#### `GET /api/investors`
List all investors, ordered by name.

**Auth:** required  
**Response:** `200` `list[InvestorSummary]`

---

#### `GET /api/investors/{investor_id}`
Get full investor profile including nested notes.

**Auth:** required  
**Path param:** `investor_id` (UUID)  
**Response:** `200` `InvestorDetail`  
**Errors:** `404` investor not found

Uses `joinedload(Investor.notes)` to avoid N+1.

---

#### `POST /api/investors`
Create a new investor.

**Auth:** required  
**Request body:** `InvestorCreate`  
**Response:** `201` `InvestorDetail`

---

### Notes — `/api`

#### `GET /api/investors/{investor_id}/notes`
List all notes for an investor, newest first.

**Auth:** required  
**Path param:** `investor_id` (UUID)  
**Response:** `200` `list[NoteResponse]`  
**Errors:** `404` investor not found

---

#### `POST /api/notes`
Create a note. Sets `created_by` to the authenticated user automatically.

**Auth:** required  
**Request body:**
```json
{
  "investor_id": "<uuid>",
  "content": "Discussed Q3 targets..."
}
```
**Response:** `201` `NoteResponse`  
**Errors:** `404` investor not found

---

### Interactions — `/api`

#### `GET /api/interactions?investor_id={uuid}`
List all interactions for an investor, newest first.

**Auth:** required  
**Query param:** `investor_id` (UUID, required)  
**Response:** `200` `list[InteractionResponse]`  
**Errors:** `404` investor not found

---

#### `POST /api/interactions`
Log a new interaction.

**Auth:** required  
**Request body:**
```json
{
  "investor_id": "<uuid>",
  "type": "call",
  "title": "Q2 follow-up",
  "description": "Discussed revised ESG proposal."
}
```
**Valid types:** `"call"` | `"meeting"` | `"email"`  
**Response:** `201` `InteractionResponse`  
**Errors:** `404` investor not found

---

### Documents — `/api/documents`

#### `GET /api/documents`
List all documents with investor name and chunk count.

**Auth:** required  
**Response:** `200` `list[DocumentListItem]`

Single query using `outerjoin` to `Investor` and `DocumentChunk` with `func.count`. Returns newest first.

---

#### `POST /api/documents/upload`
Upload and ingest a PDF document.

**Auth:** required  
**Content-Type:** `multipart/form-data`  
**Form fields:**
- `file` (File, required) — PDF only
- `investor_id` (string, optional) — UUID of investor to link

**Processing pipeline:**
1. Validates content-type is PDF
2. Reads raw bytes
3. Extracts text with pypdf (all pages)
4. Cleans text (strips null bytes, control characters, normalises whitespace)
5. Validates `investor_id` exists in DB (returns `404` if not)
6. Persists `Document` row (with raw bytes in `file_data`)
7. Chunks text into ~500-char overlapping segments
8. Embeds each chunk with `all-MiniLM-L6-v2` (384-dim)
9. Persists `DocumentChunk` rows with embeddings

**Response:** `201` `DocumentUploadResponse`  
**Errors:** `415` non-PDF, `422` no extractable text, `404` investor not found, `502` embedding failure (with rollback)

---

#### `DELETE /api/documents/{document_id}`
Delete a document and all its chunks.

**Auth:** required  
**Path param:** `document_id` (UUID)  
**Response:** `204 No Content`  
**Errors:** `404` document not found

Chunks are removed automatically via `ON DELETE CASCADE` on the `document_chunks.document_id` FK.

---

#### `GET /api/documents/{document_id}/download`
Stream the original PDF bytes back to the client.

**Auth:** required  
**Path param:** `document_id` (UUID)  
**Response:** `200` `application/pdf` with `Content-Disposition: inline; filename="<name>"`  
**Errors:** `404` document not found or no file data

> The frontend does not use `window.open()` for this endpoint because bearer tokens cannot be sent via browser navigation. Instead, it calls `getDocumentBlobUrl(id)` which fetches the file via axios (with the auth header), creates a `Blob URL`, and opens it with `window.open(blobUrl, '_blank')`.

---

#### `POST /api/documents/search`
Semantic search over document chunks using pgvector.

**Auth:** required  
**Request body:**
```json
{
  "query": "ESG compliance framework",
  "investor_id": null
}
```
**Response:** `200` `list[DocumentChunkResult]` (up to 5 results)

```json
[
  {
    "content": "The ESG compliance framework requires...",
    "document_id": "<uuid>",
    "document_name": "Compliance_Audit_2023.pdf",
    "score": 0.923
  }
]
```

**Score:** Cosine similarity normalised to `[0, 1]`. `1 = identical`, `0 = orthogonal`.  
Formula: `score = 1 - (cosine_distance / 2)` where `<=>` is pgvector's cosine-distance operator with range `[0, 2]`.

If `investor_id` is provided, results are filtered to chunks from documents linked to that investor.

---

## 8. Authentication System

**File:** `backend/app/services/auth_service.py`

### Password hashing

```python
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())
```

Uses `bcrypt` directly. Salt is generated per-password via `bcrypt.gensalt()`.

### JWT

```python
SECRET_KEY = "grantpilot-secret-key-change-in-production"
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
```

**Token payload:**
```json
{
  "sub": "<user_uuid>",
  "role": "member",
  "exp": <unix_timestamp>
}
```

Tokens expire after 24 hours. Signed with HS256.

### `get_current_user` dependency

Defined in `routers/auth.py` and imported by every other router:

```python
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(401, "User not found")
    return user
```

Any route that includes `current_user: User = Depends(get_current_user)` is automatically protected. Invalid or expired tokens raise `401`.

---

## 9. Embedding & Vector Search

**File:** `backend/app/services/embedding.py`

### Model

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("all-MiniLM-L6-v2")

def generate_embedding(text: str) -> list[float]:
    return model.encode(text).tolist()
```

- Model: `all-MiniLM-L6-v2`
- Output: 384-dimensional float vector
- Model is loaded once at import time (startup) — not per-request
- `sentence_transformers` runs locally, no external API calls

### Vector column

```python
from pgvector.sqlalchemy import Vector
embedding = Column(Vector(384), nullable=True)
```

The `Vector(384)` type is provided by the `pgvector` SQLAlchemy integration. Requires `CREATE EXTENSION vector` in PostgreSQL.

### Similarity search query

```python
cosine_distance = DocumentChunk.embedding.op("<=>")(query_vec)

q = (
    db.query(DocumentChunk, Document.name.label("document_name"), (1 - cosine_distance / 2).label("score"))
    .join(Document, DocumentChunk.document_id == Document.id)
    .filter(DocumentChunk.embedding.is_not(None))
    .order_by(cosine_distance)
    .limit(5)
)
```

- `<=>` is the pgvector cosine-distance operator. Range: `[0, 2]` (0 = identical vectors, 2 = opposite vectors).
- Score is normalised to `[0, 1]` via `1 - distance/2`.
- Results are ordered ascending by distance (closest first).
- Chunks with `NULL` embeddings are excluded.

---

## 10. Document Ingestion Pipeline

**File:** `backend/app/routers/documents.py`

### Chunking algorithm

```
_CHUNK_SIZE    = 500   characters
_CHUNK_OVERLAP = 50    characters
```

The text is split using a sliding window:
1. Set `start = 0`
2. Set `end = start + 500`
3. Walk back from `end` to the nearest space (to avoid splitting mid-word)
4. Append `text[start:boundary]` as a chunk
5. Advance: `start = boundary - 50` (50-char overlap preserves cross-boundary context)
6. Repeat until end of text

Chunks shorter than 20 characters are discarded. This filters page headers, footers, and extraction artefacts.

### Text cleaning

Before chunking, extracted text is cleaned:
- Null bytes (`\x00`) removed — PostgreSQL rejects them
- Control characters (`\x00–\x1f`, `\x7f–\x9f`) replaced with spaces
- Whitespace normalised (multiple spaces/newlines → single space)

### Transaction safety

The upload uses `db.flush()` after inserting the `Document` row to materialise its UUID before the chunks loop begins — without committing. If any embedding call fails mid-loop, `db.rollback()` is called and a `502` is returned. No partial document is ever committed.

---

## 11. Frontend Architecture

### Entry point

`frontend/src/main.tsx` → `ReactDOM.createRoot(root).render(<App />)`

### Router (`App.tsx`)

```
/login          → Login (no auth required)
/investors      → Investors (auth required)
/investor/:id   → InvestorDetail (auth required)
/documents      → Documents (auth required)
*               → redirect to /investors or /login
```

Auth guard is a simple inline check: `!!localStorage.getItem('token')`. On any route change, if the token is absent, the user is redirected to `/login`.

> **No token refresh.** Tokens are 24-hour JWTs. When a token expires, the next API call returns `401`, but the UI does not currently auto-redirect to login on 401. This is a known gap.

### State management

No global state library (no Redux, no Zustand). All state is local `useState` hooks within each page component. Data fetching is done with async IIFEs inside `useEffect`.

### axios interceptor

```typescript
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
  }
  return config;
});
```

Every outbound request gets the Bearer token attached automatically.

---

## 12. Pages & Screens

### Login (`/login`)

**File:** `src/pages/Login.tsx`

- Full-screen centred card layout
- Email + password form with validation
- On success: stores token in `localStorage`, navigates to `/investors`
- Error message rendered inline if credentials fail
- Uses `useNavigate` (not `window.location.href`) for SPA navigation

**State:** `email`, `password`, `error`, `loading`  
**API call:** `POST /api/auth/login`

---

### Investors (`/investors`)

**File:** `src/pages/Investors.tsx`

Full page with its own sidebar. Displays all investors as a responsive card grid.

**Layout:**
- Left: fixed `w-64` sidebar with navigation
- Right: scrollable main area with header, filter bar, card grid

**Features:**
- Investor cards with placeholder image (initials-based via placehold.co)
- Stage badge with colour coding:
  - `grant`, `committed` → emerald green
  - `series_a`, `series_b`, `meeting` → tertiary (blue)
  - All others (`seed`, `pre_seed`, `proposal`) → gold (primary)
- Clicking a card navigates to `/investor/:id`
- Loading state, error state, empty state

**State:** `investors`, `loading`, `error`  
**API call:** `GET /api/investors`

---

### Investor Detail (`/investor/:id`)

**File:** `src/pages/InvestorDetail.tsx`

Content-only component (no sidebar — rendered inside the full-page layout from `Investors.tsx`'s navigation). Uses `max-w-7xl mx-auto p-8`.

**Sections:**

| Section | Data source |
|---|---|
| Breadcrumb | Static + investor name |
| Hero (name, org, avatar initials) | Real — `GET /api/investors/:id` |
| Deal Stage Pipeline | Real — `stage` field mapped to 7-step pipeline |
| Recommended Next Action | Placeholder |
| Sector Interests | Real — `interests[]` array, fallback to static |
| Interaction Timeline | Real — `GET /api/interactions?investor_id=:id` |
| Log Interaction form | Real — `POST /api/interactions` |
| Internal Relations | Placeholder |
| Documents | Placeholder |
| Team Notes | Real — `GET /api/investors/:id/notes` |
| Add Note form | Real — `POST /api/notes` |
| Generate AI Briefing | Placeholder button |

**Pipeline stage mapping:**

| DB stage value | Pipeline step | Index |
|---|---|---|
| `pre_seed`, `cold` | Cold | 0 |
| `seed`, `initial` | Initial | 1 |
| `qualifying`, `qualified`, `series_a` | Qualified | 2 |
| `grant`, `proposal`, `series_b` | Proposal | 3 |
| `diligent` | Diligent | 4 |
| `commit`, `committed` | Commit | 5 |
| `received` | Received | 6 |

**Data fetching:** `Promise.all([investor, notes, interactions])` on mount — three parallel requests.

**Interaction timeline:** Sorted newest-first (backend orders by `created_at DESC`). First item (most recent) gets a gold `bg-primary` dot; the rest get `bg-outline-variant`. Type icons: `phone` (call), `groups` (meeting), `mail` (email).

---

### Documents (`/documents`)

**File:** `src/pages/Documents.tsx`

Full page with its own sidebar (Documents nav item active).

**Layout:**
- Left: `w-64` sidebar (identical to Investors page)
- Right: scrollable main area

**Top toolbar (single flex row):**
```
[ Search input (flex-1) ] [ Investor ▾ ] [ Type ▾ ] [ Date ▾ ] [ Clear ] [ Upload ]
```
All elements are `h-10` for consistent vertical alignment.

**Filters (client-side, AND logic):**

| Filter | Options | Logic |
|---|---|---|
| Investor | All + each investor name | Exact match on `investor_name` |
| Type | All, PDF, Spreadsheet, Document, Presentation, File | Derived from file extension |
| Date | All time, Last 7 days, Last 30 days, This year | Compared against `created_at` |

File type → label mapping:

| Extension | Label | Icon | Colour |
|---|---|---|---|
| `.pdf` | PDF | `picture_as_pdf` | red-400 |
| `.xlsx`, `.xls`, `.csv` | Spreadsheet | `table_chart` | green-400 |
| `.docx`, `.doc` | Document | `description` | blue-400 |
| `.pptx`, `.ppt` | Presentation | `show_chart` | primary (gold) |
| other | File | `attach_file` | outline |

**AI Search:**
- Debounced 500ms after user stops typing
- Calls `POST /api/documents/search`
- Results show above the table with content snippet and a relevance score bar
- Score bar colours: green ≥ 85%, gold ≥ 65%, grey < 65%
- Clearing the query resets to the full document list

**Upload flow:**
1. Upload button triggers hidden `<input type="file" accept=".pdf">`
2. File selected → inline upload panel appears
3. Panel shows filename, optional investor `<select>`, Confirm Upload button
4. On confirm → `POST /api/documents/upload` (multipart/form-data)
5. On success → panel closes, document list refreshes

**Delete:** `window.confirm` → `DELETE /api/documents/:id` → list refresh

**View/Download:** `getDocumentBlobUrl(id)` → axios fetches bytes with auth header → `URL.createObjectURL(blob)` → `window.open(blobUrl, '_blank')`

**Document count:** Shows `"3 of 12 files"` when filters are active, `"12 files"` otherwise.

**Empty states:**
- No documents at all → icon + "Upload your first document" link
- Documents exist but filters match nothing → icon + "Clear filters" link

---

## 13. API Client Layer

**File:** `src/api/client.ts`

Single axios instance used by all API modules. Base URL: `http://localhost:8000`. Auth header attached via request interceptor.

### `src/api/auth.ts`

| Function | Method | Endpoint | Description |
|---|---|---|---|
| `login(email, password)` | POST | `/api/auth/login` | Returns `{ access_token, token_type }` |

### `src/api/investors.ts`

| Function | Method | Endpoint | Description |
|---|---|---|---|
| `getInvestors()` | GET | `/api/investors` | Returns `Investor[]` |

**Type `Investor`:** `{ id, name, organization, stage }`

### `src/api/documents.ts`

| Function | Method | Endpoint | Description |
|---|---|---|---|
| `getDocuments()` | GET | `/api/documents` | Returns `DocumentItem[]` |
| `uploadDocument(file, investorId?)` | POST | `/api/documents/upload` | multipart/form-data |
| `deleteDocument(id)` | DELETE | `/api/documents/:id` | Returns void |
| `searchDocuments(query, investorId?)` | POST | `/api/documents/search` | Returns `DocumentSearchResult[]` |
| `getDocumentBlobUrl(id)` | GET | `/api/documents/:id/download` | Returns blob URL string |

**Type `DocumentItem`:** `{ id, name, investor_name?, created_at, chunk_count }`  
**Type `DocumentSearchResult`:** `{ content, document_id, document_name, score }`

---

## 14. Design System

The design system is defined inline in `frontend/index.html` as a Tailwind config object. Dark mode is enabled via `class="dark"` on the `<html>` element.

### Colour tokens (key subset)

| Token | Hex | Usage |
|---|---|---|
| `background` | `#111318` | Page background |
| `surface` | `#111318` | Same as background |
| `surface-dim` | `#111318` | Dimmed surface areas |
| `surface-container-low` | `#1a1c21` | Cards, sidebars |
| `surface-container` | `#1e2025` | Card bodies, inputs |
| `surface-container-high` | `#282a2f` | Hover states |
| `surface-container-highest` | `#33353a` | Borders, dividers |
| `primary` | `#e6c487` | Gold accent, active labels |
| `primary-container` | `#c9a96e` | Buttons, active backgrounds |
| `on-primary-container` | `#543d0c` | Text on gold buttons |
| `on-surface` | `#e2e2e9` | Primary text |
| `on-surface-variant` | `#d0c5b5` | Secondary text, labels |
| `outline` | `#998f81` | Borders, placeholder text |
| `outline-variant` | `#4d463a` | Subtle borders |
| `tertiary` | `#b8c8f2` | Blue accent (series stage badges) |
| `tertiary-container` | `#9dadd5` | Blue badge backgrounds |
| `error` | `#ffb4ab` | Error text |
| `error-container` | `#93000a` | Error background |

### Border radius

| Token | Value |
|---|---|
| DEFAULT | `0.125rem` (2px) — almost square |
| `lg` | `0.25rem` (4px) |
| `xl` | `0.5rem` (8px) |
| `full` | `0.75rem` (12px) |

### Typography

All text uses **Inter** (Google Fonts). No secondary typeface. Weights 300–900 loaded. Font family tokens `headline`, `body`, and `label` all map to Inter.

### Material Symbols

Icons use Google's `Material Symbols Outlined` variable font. The default variation settings are:
```css
font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
```
Filled variants are applied inline: `style={{ fontVariationSettings: "'FILL' 1" }}`

### Global CSS (`src/index.css`)

```css
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: 'Inter', sans-serif; background-color: #111318; }
#root { min-height: 100vh; }

/* Utility: hide scrollbar while retaining scroll */
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Subtle gold border utility */
.ghost-border { border: 1px solid rgba(77, 70, 58, 0.2); }
```

### Sidebar (shared visual pattern)

The sidebar is not a shared component — each full-page component (`Investors`, `Documents`) includes its own copy. The structure is identical:

```
w-64 | bg-[#1f2128] | border-r border-outline-variant/10 | py-6 px-4
  ├── GP logo mark (bg-[#c9a96e], 32×32)
  ├── nav items (inactive: text-[#94a3b8], active: text-[#e6c487] + bg-[#111318]/50)
  └── footer (Log Interaction button, Settings link)
```

Active nav item uses: gold text `text-[#e6c487]` + dark bg `bg-[#111318]/50` + filled icon variant.

### Table row hover effect

```
hover:shadow-[inset_2px_0_0_0_#c9a96e]
```

Creates a 2px gold left-border appearance using `box-shadow` instead of `border-left` to avoid layout shift.

---

## 15. Environment & Configuration

### Backend

| Variable | Where | Value |
|---|---|---|
| `DATABASE_URL` | `database.py` (hardcoded) | `postgresql://postgres:password@localhost:5432/grantpilot` |
| `SECRET_KEY` | `auth_service.py` (hardcoded) | `"grantpilot-secret-key-change-in-production"` |
| `ALGORITHM` | `auth_service.py` | `"HS256"` |
| `ACCESS_TOKEN_EXPIRE_HOURS` | `auth_service.py` | `24` |

> Both `DATABASE_URL` and `SECRET_KEY` are hardcoded for development. Move these to environment variables (`.env` + `python-dotenv`) before any production deployment.

### Frontend

| Variable | Where | Value |
|---|---|---|
| `baseURL` | `src/api/client.ts` (hardcoded) | `http://localhost:8000` |

### CORS

Configured in `app/main.py`:
```python
allow_origins=["http://localhost:5173"],
allow_credentials=True,
allow_methods=["*"],
allow_headers=["*"],
```

Only the Vite dev server origin is allowed. `allow_credentials=True` is required because the frontend sends cookies and the `Authorization` header. Wildcard origins (`*`) cannot be combined with `allow_credentials=True` per the CORS spec — hence the explicit origin.

---

## 16. Running the Project

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 16 (running on port 5432)
- pgvector extension installed in PostgreSQL

### One-time database setup

```sql
-- Connect to PostgreSQL as superuser
CREATE DATABASE grantpilot;
\c grantpilot
CREATE EXTENSION IF NOT EXISTS vector;

-- Add file_data column if upgrading from earlier version
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data BYTEA;
```

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn sqlalchemy psycopg2-binary python-jose bcrypt \
            pypdf pgvector sentence-transformers pydantic[email]

# Start server
uvicorn app.main:app --reload --port 8000
```

Tables are created automatically on first startup via `Base.metadata.create_all()`.

API docs available at: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend

npm install
npm run dev
```

App available at: `http://localhost:5173`

### Python dependencies (full list)

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `sqlalchemy` | ORM |
| `psycopg2-binary` | PostgreSQL driver |
| `python-jose` | JWT encode/decode |
| `bcrypt` | Password hashing |
| `pypdf` | PDF text extraction |
| `pgvector` | pgvector SQLAlchemy type + operators |
| `sentence-transformers` | Local embedding model |
| `pydantic[email]` | Validation + EmailStr support |

### npm dependencies (key packages)

| Package | Purpose |
|---|---|
| `react` / `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `axios` | HTTP client |
| `typescript` | Type safety |
| `vite` | Build tool and dev server |

---

*Grant Pilot — Built with FastAPI, PostgreSQL, pgvector, React, and TypeScript.*
