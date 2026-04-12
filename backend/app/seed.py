"""
Seed script — safe to re-run (idempotent).
Usage:  python -m app.seed   (from backend/)
"""

from app.database import SessionLocal, engine, Base
import app.models  # noqa: F401 — ensure all models are registered

from app.models.user import User, UserRole
from app.models.investor import Investor
from app.models.note import Note
from app.services.auth_service import hash_password

Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# Seed data definitions
# ---------------------------------------------------------------------------

USERS = [
    {
        "email": "priya.sharma@grantpilot.com",
        "password": "Password123!",
        "name": "Priya Sharma",
        "role": UserRole.head,
    },
    {
        "email": "rahul.kumar@grantpilot.com",
        "password": "Password123!",
        "name": "Rahul Kumar",
        "role": UserRole.member,
    },
]

INVESTORS = [
    {
        "name": "Ananya Mehta",
        "email": "ananya.mehta@venturecap.in",
        "organization": "VentureCap India",
        "stage": "seed",
        "capacity": 500_000.0,
        "ask_amount": 100_000.0,
        "interests": ["edtech", "climate", "rural development"],
    },
    {
        "name": "Vikram Nair",
        "email": "vikram.nair@bridgefund.io",
        "organization": "Bridge Fund",
        "stage": "series_a",
        "capacity": 2_000_000.0,
        "ask_amount": 350_000.0,
        "interests": ["health", "fintech", "social impact"],
    },
    {
        "name": "Sunita Rao",
        "email": "sunita.rao@impactfirst.org",
        "organization": "Impact First Foundation",
        "stage": "grant",
        "capacity": 750_000.0,
        "ask_amount": 200_000.0,
        "interests": ["women empowerment", "education", "livelihoods"],
    },
    {
        "name": "Aditya Bose",
        "email": "aditya.bose@growthbridge.vc",
        "organization": "GrowthBridge Ventures",
        "stage": "series_b",
        "capacity": 5_000_000.0,
        "ask_amount": 500_000.0,
        "interests": ["agritech", "supply chain", "rural fintech"],
    },
    {
        "name": "Meera Iyer",
        "email": "meera.iyer@catalystfund.net",
        "organization": "Catalyst Fund",
        "stage": "pre_seed",
        "capacity": 250_000.0,
        "ask_amount": 75_000.0,
        "interests": ["sanitation", "water", "climate resilience"],
    },
]

NOTES = {
    "Ananya Mehta": [
        "Met at Social Impact Summit 2024. Very interested in our rural edtech pilot. Follow up in Q2.",
        "Sent pitch deck on 2024-11-10. Awaiting feedback.",
    ],
    "Vikram Nair": [
        "Warm intro via Rahul. Prefers video call first. Schedule for March.",
    ],
    "Sunita Rao": [
        "Applied for their annual grant cycle. Decision expected by June 2025.",
        "Impact report requested — shared our 2023 annual impact document.",
    ],
    "Aditya Bose": [
        "Initial meeting was very promising. Wants to see 12-month financials.",
    ],
    "Meera Iyer": [
        "Connected on LinkedIn. She funds only sub-$100K tickets. Adjust ask accordingly.",
        "Follow-up call booked for 2025-02-20.",
    ],
}

# ---------------------------------------------------------------------------


def seed():
    db = SessionLocal()
    try:
        # -- Users -----------------------------------------------------------
        user_map: dict[str, User] = {}
        for u in USERS:
            existing = db.query(User).filter(User.email == u["email"]).first()
            if existing:
                print(f"  [skip] User already exists: {u['email']}")
                user_map[u["name"]] = existing
            else:
                user = User(
                    email=u["email"],
                    hashed_password=hash_password(u["password"]),
                    name=u["name"],
                    role=u["role"],
                )
                db.add(user)
                db.flush()
                user_map[u["name"]] = user
                print(f"  [ok]   Created user: {u['email']} ({u['role'].value})")

        # -- Investors -------------------------------------------------------
        investor_map: dict[str, Investor] = {}
        for inv_data in INVESTORS:
            existing = db.query(Investor).filter(Investor.email == inv_data["email"]).first()
            if existing:
                print(f"  [skip] Investor already exists: {inv_data['name']}")
                investor_map[inv_data["name"]] = existing
            else:
                investor = Investor(**inv_data)
                db.add(investor)
                db.flush()
                investor_map[inv_data["name"]] = investor
                print(f"  [ok]   Created investor: {inv_data['name']} ({inv_data['stage']})")

        # -- Notes -----------------------------------------------------------
        # Use Priya (head) as default author
        default_author = user_map.get("Priya Sharma")

        for investor_name, note_texts in NOTES.items():
            investor = investor_map.get(investor_name)
            if not investor:
                continue
            for text in note_texts:
                # Check for exact duplicate note
                exists = (
                    db.query(Note)
                    .filter(Note.investor_id == investor.id, Note.content == text)
                    .first()
                )
                if exists:
                    print(f"  [skip] Note already exists for {investor_name}")
                else:
                    note = Note(
                        investor_id=investor.id,
                        content=text,
                        created_by=default_author.id if default_author else None,
                    )
                    db.add(note)
                    print(f"  [ok]   Added note for {investor_name}")

        db.commit()
        print("\nSeed complete.")

    except Exception as e:
        db.rollback()
        print(f"\nSeed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
