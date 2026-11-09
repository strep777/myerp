from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Index, Integer, String, Text

from app.core.database import Base, UTCDateTime, utcnow


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_created_at", "created_at"),
        Index("ix_audit_user", "user_id"),
        Index("ix_audit_entity", "entity_type", "entity_id"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username_snapshot = Column(String(50), nullable=False, default="")
    action = Column(String(30), nullable=False)
    entity_type = Column(String(30), nullable=False, default="")
    entity_id = Column(Integer, nullable=True)
    entity_no = Column(String(60), nullable=False, default="")
    summary = Column(String(240), nullable=False, default="")
    detail = Column(Text, nullable=False, default="{}")
    ip = Column(String(64), nullable=False, default="")
    created_at = Column(UTCDateTime, nullable=False, default=utcnow)
