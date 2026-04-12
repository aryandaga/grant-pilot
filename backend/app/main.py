from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
import app.models  # noqa: F401 — registers all models with Base

from app.routers import auth, investors, notes, interactions, documents

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


@app.get("/")
def root():
    return {"message": "Grant Pilot backend running"}
