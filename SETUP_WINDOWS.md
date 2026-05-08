# Grant Pilot Windows Setup

This project is a FastAPI backend, React/Vite frontend, and PostgreSQL database with pgvector.

## 1. Install Python 3.11

Python is currently missing from this machine. Use the official 64-bit Python 3.11.9 Windows installer:

https://www.python.org/downloads/release/python-3119/

During install, enable:

- Add python.exe to PATH
- pip
- py launcher

Python.org lists newer 3.11 security releases, but they are source-only. Python 3.11.9 is the last 3.11 release with Windows binary installers.

Verify in a new PowerShell window:

```powershell
python --version
py -3.11 --version
python -m pip --version
```

## 2. Start PostgreSQL

Docker is used only for the database.

```powershell
docker compose up -d
```

The database runs at:

```text
postgresql://postgres:password@localhost:5432/grantpilot
```

## 3. Configure Backend

```powershell
cd backend
copy .env.example .env
```

Edit `backend/.env` and set `GEMINI_API_KEY` if you want the AI assistant endpoint to work.

Create and populate the Python environment:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell blocks activation, run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then run the backend:

```powershell
uvicorn app.main:app --reload
```

Backend URL:

```text
http://localhost:8000
```

API docs:

```text
http://localhost:8000/docs
```

## 4. Seed Demo Data

In another PowerShell window:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.seed
```

Demo login:

```text
priya.sharma@grantpilot.com
Password123!
```

## 5. Run Frontend

Node is installed. On this machine, PowerShell blocks `npm.ps1`, so use `npm.cmd`:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Frontend URL:

```text
http://localhost:5173
```

## What The App Does

- Login/register users with JWT auth and bcrypt password hashing.
- Manage investors, notes, and interaction timelines.
- Upload PDFs, extract text with pypdf, split text into chunks, and store embeddings in PostgreSQL via pgvector.
- Search documents semantically with sentence-transformers.
- Ask Gemini questions over uploaded document context when `GEMINI_API_KEY` is configured.
