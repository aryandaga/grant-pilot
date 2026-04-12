import uuid
from sqlalchemy import Column, String, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Interaction(Base):
    __tablename__ = "interactions"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    investor_id = Column(UUID(as_uuid=True), ForeignKey("investors.id"), nullable=False)
    type        = Column(String, nullable=False)        # e.g. "call", "email", "meeting"
    title       = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    investor = relationship("Investor", backref="interactions")
