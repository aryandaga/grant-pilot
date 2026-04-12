import uuid
from sqlalchemy import Column, String, Float, ARRAY, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Investor(Base):
    __tablename__ = "investors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    stage = Column(String, nullable=False)          # e.g. "seed", "series_a"
    capacity = Column(Float, nullable=True)         # total investment capacity (USD)
    ask_amount = Column(Float, nullable=True)       # amount being asked from this investor
    interests = Column(ARRAY(Text), nullable=True)  # list of focus areas
    email = Column(String, nullable=True)
    organization = Column(String, nullable=True)
