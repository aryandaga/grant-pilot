"""
Seed script - safe to re-run (idempotent).
Usage: python -m app.seed   (from backend/)
"""

from app.database import Base, SessionLocal, engine
import app.models  # noqa: F401 - ensure all models are registered

from app.models.interaction import Interaction
from app.models.investor import Investor
from app.models.investor_stage import LEGACY_STAGE_MAP, normalize_investor_stage
from app.models.note import Note
from app.models.user import User, UserRole
from app.services.auth_service import hash_password

Base.metadata.create_all(bind=engine)


def ensure_primary_owner_column():
    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            ALTER TABLE investors
            ADD COLUMN IF NOT EXISTS primary_owner_id UUID REFERENCES users(id)
            """
        )


def backfill_investor_stages():
    with engine.begin() as conn:
        for old_stage, new_stage in LEGACY_STAGE_MAP.items():
            conn.exec_driver_sql(
                "UPDATE investors SET stage = %s WHERE stage = %s",
                (new_stage, old_stage),
            )


# ---------------------------------------------------------------------------
# Seed data definitions
# ---------------------------------------------------------------------------

DEFAULT_PASSWORD = "Password123!"

USERS = [
    {
        "email": "sarika@plaksha.edu.in",
        "legacy_emails": ["priya.sharma@grantpilot.com"],
        "password": DEFAULT_PASSWORD,
        "name": "Sarika",
        "role": UserRole.head,
    },
    {
        "email": "varun@plaksha.edu.in",
        "legacy_emails": ["rahul.kumar@grantpilot.com"],
        "password": DEFAULT_PASSWORD,
        "name": "Varun",
        "role": UserRole.member,
    },
    {
        "email": "nandini@plaksha.edu.in",
        "legacy_emails": [],
        "password": DEFAULT_PASSWORD,
        "name": "Nandini",
        "role": UserRole.member,
    },
]

INVESTORS = [
    {
        "legacy_emails": ["ananya.mehta@venturecap.in"],
        "name": "Aakash Chaudhry",
        "primary_owner": "Sarika",
        "email": "aakash.chaudhry@example.com",
        "organization": "Sparkl Edventure",
        "stage": "proposal",
        "capacity": 10_000_000.0,
        "ask_amount": 2_000_000.0,
        "interests": ["STEM access", "founder mentoring", "student scholarships"],
    },
    {
        "legacy_emails": ["vikram.nair@bridgefund.io"],
        "name": "Alok Mittal",
        "primary_owner": "Varun",
        "email": "alok.mittal@example.com",
        "organization": "Indifi Technologies",
        "stage": "visit_campus",
        "capacity": 7_500_000.0,
        "ask_amount": 1_500_000.0,
        "interests": ["fintech", "entrepreneurship", "industry projects"],
    },
    {
        "legacy_emails": ["sunita.rao@impactfirst.org"],
        "name": "Anil Rai Gupta",
        "primary_owner": "Sarika",
        "email": "anil.rai.gupta@example.com",
        "organization": "Havells India",
        "stage": "verbal_commitment",
        "capacity": 15_000_000.0,
        "ask_amount": 3_500_000.0,
        "interests": ["hardware labs", "manufacturing", "energy systems"],
    },
    {
        "legacy_emails": ["aditya.bose@growthbridge.vc"],
        "name": "Hitesh Oberoi",
        "primary_owner": "Nandini",
        "email": "hitesh.oberoi@example.com",
        "organization": "Info Edge",
        "stage": "mou",
        "capacity": 12_000_000.0,
        "ask_amount": 2_500_000.0,
        "interests": ["AI talent", "career pathways", "digital platforms"],
    },
    {
        "legacy_emails": ["meera.iyer@catalystfund.net"],
        "name": "Srikanth Velamakanni",
        "primary_owner": "Sarika",
        "email": "srikanth.velamakanni@example.com",
        "organization": "Fractal Analytics",
        "stage": "draw_down_1",
        "capacity": 20_000_000.0,
        "ask_amount": 5_000_000.0,
        "interests": ["AI research", "data science", "faculty chairs"],
    },
    {
        "legacy_emails": [],
        "name": "Sujeet Kumar",
        "primary_owner": "Varun",
        "email": "sujeet.kumar@example.com",
        "organization": "Udaan",
        "stage": "initial",
        "capacity": 8_000_000.0,
        "ask_amount": 1_250_000.0,
        "interests": ["supply chains", "startup studio", "rural commerce"],
    },
    {
        "legacy_emails": [],
        "name": "Rakesh Bharti Mittal",
        "primary_owner": "Nandini",
        "email": "rakesh.bharti.mittal@example.com",
        "organization": "Bharti Enterprises",
        "stage": "cold",
        "capacity": 25_000_000.0,
        "ask_amount": 4_000_000.0,
        "interests": ["telecom", "connectivity", "campus infrastructure"],
    },
    {
        "legacy_emails": [],
        "name": "Pramod Bhasin",
        "primary_owner": "Sarika",
        "email": "pramod.bhasin@example.com",
        "organization": "Clix Capital",
        "stage": "draw_down_2",
        "capacity": 18_000_000.0,
        "ask_amount": 3_000_000.0,
        "interests": ["financial aid", "institution building", "governance"],
    },
]

TEAM_NOTES = {
    "Aakash Chaudhry": [
        ("Sarika", "Team Note - Sarika: Position ask around scholarships for high-potential students from Tier 2 and Tier 3 cities."),
        ("Varun", "Team Note - Varun: Share the Young Technology Scholars funnel and founder mentorship plan before proposal review."),
    ],
    "Alok Mittal": [
        ("Varun", "Team Note - Varun: Strong fit for fintech, MSME, and venture-building themes. Prepare a compact entrepreneurship lab brief."),
        ("Nandini", "Team Note - Nandini: Ask for one office-hours session with student startup teams during the campus visit."),
    ],
    "Anil Rai Gupta": [
        ("Sarika", "Team Note - Sarika: Verbal commitment depends on a clearer equipment list for hardware and energy systems labs."),
        ("Nandini", "Team Note - Nandini: Send capex breakup and naming options for the applied engineering studio."),
    ],
    "Hitesh Oberoi": [
        ("Nandini", "Team Note - Nandini: MOU draft shared with legal. Need confirmation on annual career-tech fellowship milestones."),
        ("Sarika", "Team Note - Sarika: Include placement and AI curriculum outcomes in the final stewardship deck."),
    ],
    "Srikanth Velamakanni": [
        ("Sarika", "Team Note - Sarika: First drawdown received for AI research initiative. Next milestone is faculty chair announcement."),
        ("Varun", "Team Note - Varun: Collect student research stories for donor update before the second drawdown discussion."),
    ],
    "Sujeet Kumar": [
        ("Varun", "Team Note - Varun: Initial conversation was positive. Map Plaksha's startup studio to commerce and logistics problems."),
        ("Nandini", "Team Note - Nandini: Prepare a one-page note on rural entrepreneurship pilots and student immersion projects."),
    ],
    "Rakesh Bharti Mittal": [
        ("Nandini", "Team Note - Nandini: Cold lead. Warm introduction requested through founding community office."),
        ("Sarika", "Team Note - Sarika: Position campus connectivity and digital public infrastructure as the opening conversation."),
    ],
    "Pramod Bhasin": [
        ("Sarika", "Team Note - Sarika: Second drawdown planned after audit packet and scholarship utilization report are approved."),
        ("Varun", "Team Note - Varun: Draft governance update should highlight use of funds and operating leverage."),
    ],
}

INTERACTIONS = {
    "Aakash Chaudhry": [
        {
            "type": "meeting",
            "title": "Proposal working session",
            "description": "Reviewed scholarship ask, student outcomes, and founder mentorship model with Sarika and Varun.",
        },
        {
            "type": "email",
            "title": "Sent scholarship proposal deck",
            "description": "Shared draft proposal, budget, and annual reporting format for review.",
        },
    ],
    "Alok Mittal": [
        {
            "type": "call",
            "title": "Campus visit planning call",
            "description": "Aligned on a campus visit focused on entrepreneurship, fintech projects, and student startup demos.",
        },
        {
            "type": "meeting",
            "title": "Founder mentoring roundtable",
            "description": "Discussed a possible recurring founder office-hours program for Plaksha venture teams.",
        },
    ],
    "Anil Rai Gupta": [
        {
            "type": "meeting",
            "title": "Hardware lab commitment discussion",
            "description": "Discussed lab naming, equipment plan, and annual reporting for applied engineering facilities.",
        },
        {
            "type": "email",
            "title": "Shared revised capex note",
            "description": "Sent updated hardware lab budget, procurement schedule, and donor recognition options.",
        },
    ],
    "Hitesh Oberoi": [
        {
            "type": "email",
            "title": "MOU draft sent",
            "description": "Shared MOU draft covering career-tech fellowships, AI talent pipeline, and reporting milestones.",
        },
        {
            "type": "call",
            "title": "Legal comments review",
            "description": "Reviewed open legal comments and agreed on a target signing window.",
        },
    ],
    "Srikanth Velamakanni": [
        {
            "type": "meeting",
            "title": "AI research milestone review",
            "description": "Reviewed first drawdown utilization, faculty hiring plan, and student research showcase.",
        },
        {
            "type": "email",
            "title": "Drawdown receipt and thank-you note",
            "description": "Sent acknowledgement note with next milestone timeline and research center update.",
        },
    ],
    "Sujeet Kumar": [
        {
            "type": "call",
            "title": "Introductory founder call",
            "description": "Introduced Plaksha's venture-building curriculum and potential supply-chain problem statements.",
        },
    ],
    "Rakesh Bharti Mittal": [
        {
            "type": "email",
            "title": "Warm introduction request",
            "description": "Requested introduction through founding community office for campus infrastructure conversation.",
        },
    ],
    "Pramod Bhasin": [
        {
            "type": "meeting",
            "title": "Drawdown 2 readiness review",
            "description": "Reviewed scholarship utilization, audit packet status, and governance update requirements.",
        },
        {
            "type": "email",
            "title": "Sent stewardship packet",
            "description": "Shared draft stewardship packet and requested sign-off before next disbursement.",
        },
    ],
}


# ---------------------------------------------------------------------------


def upsert_user(db, user_data: dict) -> User:
    user = db.query(User).filter(User.email == user_data["email"]).first()
    if not user:
        for legacy_email in user_data["legacy_emails"]:
            user = db.query(User).filter(User.email == legacy_email).first()
            if user:
                break

    if user:
        user.email = user_data["email"]
        user.name = user_data["name"]
        user.role = user_data["role"]
        user.hashed_password = hash_password(user_data["password"])
        print(f"  [ok]   Upserted user: {user.email} ({user.role.value})")
        return user

    user = User(
        email=user_data["email"],
        hashed_password=hash_password(user_data["password"]),
        name=user_data["name"],
        role=user_data["role"],
    )
    db.add(user)
    db.flush()
    print(f"  [ok]   Created user: {user.email} ({user.role.value})")
    return user


def find_investor(db, investor_data: dict) -> Investor | None:
    investor = db.query(Investor).filter(Investor.email == investor_data["email"]).first()
    if investor:
        return investor

    for legacy_email in investor_data["legacy_emails"]:
        investor = db.query(Investor).filter(Investor.email == legacy_email).first()
        if investor:
            return investor

    return None


def refresh_seed_notes_and_interactions(db, investor_map: dict[str, Investor], user_map: dict[str, User]):
    seed_investor_ids = [investor.id for investor in investor_map.values()]

    if seed_investor_ids:
        db.query(Interaction).filter(Interaction.investor_id.in_(seed_investor_ids)).delete(
            synchronize_session=False
        )
        db.query(Note).filter(Note.investor_id.in_(seed_investor_ids)).delete(
            synchronize_session=False
        )

    for investor_name, note_items in TEAM_NOTES.items():
        investor = investor_map.get(investor_name)
        if not investor:
            continue

        for author_name, text in note_items:
            author = user_map.get(author_name)
            db.add(
                Note(
                    investor_id=investor.id,
                    content=text,
                    created_by=author.id if author else None,
                )
            )
            print(f"  [ok]   Added team note for {investor_name}")

    for investor_name, interaction_items in INTERACTIONS.items():
        investor = investor_map.get(investor_name)
        if not investor:
            continue

        for item in interaction_items:
            db.add(
                Interaction(
                    investor_id=investor.id,
                    type=item["type"],
                    title=item["title"],
                    description=item["description"],
                )
            )
            print(f"  [ok]   Added interaction for {investor_name}: {item['title']}")


def seed():
    ensure_primary_owner_column()
    backfill_investor_stages()
    db = SessionLocal()
    try:
        # -- Users -----------------------------------------------------------
        user_map: dict[str, User] = {}
        for user_data in USERS:
            user = upsert_user(db, user_data)
            user_map[user.name] = user

        # -- Investors -------------------------------------------------------
        investor_map: dict[str, Investor] = {}
        for investor_data in INVESTORS:
            owner = user_map.get(investor_data["primary_owner"])
            payload = {
                "name": investor_data["name"],
                "email": investor_data["email"],
                "organization": investor_data["organization"],
                "stage": normalize_investor_stage(investor_data["stage"]),
                "capacity": investor_data["capacity"],
                "ask_amount": investor_data["ask_amount"],
                "interests": investor_data["interests"],
                "primary_owner_id": owner.id if owner else None,
            }

            investor = find_investor(db, investor_data)
            if investor:
                for field, value in payload.items():
                    setattr(investor, field, value)
                db.flush()
                print(f"  [ok]   Updated investor: {investor.name} ({investor.stage})")
            else:
                investor = Investor(**payload)
                db.add(investor)
                db.flush()
                print(f"  [ok]   Created investor: {investor.name} ({investor.stage})")

            investor_map[investor.name] = investor

        # -- Team notes and interactions ------------------------------------
        refresh_seed_notes_and_interactions(db, investor_map, user_map)

        db.commit()
        print("\nSeed complete.")
        print("\nDemo login:")
        print(f"  Head:   sarika@plaksha.edu.in / {DEFAULT_PASSWORD}")
        print(f"  Member: varun@plaksha.edu.in / {DEFAULT_PASSWORD}")
        print(f"  Member: nandini@plaksha.edu.in / {DEFAULT_PASSWORD}")

    except Exception as e:
        db.rollback()
        print(f"\nSeed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
