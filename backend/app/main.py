from dotenv import load_dotenv
from pathlib import Path
import os

# Force load .env from backend root
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

print("ENV PATH:", env_path)
print("GEMINI KEY:", os.getenv("GEMINI_API_KEY"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
import app.models  # noqa: F401 — registers all models with Base

from app.routers import auth, investors, notes, interactions, documents, ai

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Grant Pilot", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(investors.router)
app.include_router(notes.router)
app.include_router(interactions.router)
app.include_router(documents.router)
app.include_router(ai.router, prefix="/api/ai")


@app.get("/")
def root():
    return {"message": "Grant Pilot backend running"}
