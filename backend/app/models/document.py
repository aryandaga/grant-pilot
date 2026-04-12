import uuid
from sqlalchemy import Column, String, Text, ForeignKey, Integer, DateTime, LargeBinary
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

from app.database import Base

EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 output dimension


class Document(Base):
    __tablename__ = "documents"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    investor_id = Column(UUID(as_uuid=True), ForeignKey("investors.id"), nullable=True)
    name        = Column(String, nullable=False)
    mime_type   = Column(String, nullable=True)
    file_data   = Column(LargeBinary, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    investor = relationship("Investor", backref="documents")
    chunks   = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content     = Column(Text, nullable=False)
    embedding   = Column(Vector(EMBEDDING_DIM), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    document = relationship("Document", back_populates="chunks")
