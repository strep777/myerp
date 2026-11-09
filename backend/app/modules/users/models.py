from __future__ import annotations

from sqlalchemy import Boolean, CheckConstraint, Column, Integer, String

from app.core.database import Base, UTCDateTime, utcnow


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('ADMIN','MANAGER','OPERATOR','VIEWER')",
            name="ck_users_role",
        ),
    )

    id = Column(Integer, primary_key=True)
    username = Column(String(50), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(80), nullable=False)
    role = Column(String(20), nullable=False, default="VIEWER")
    is_active = Column(Boolean, nullable=False, default=True)
    token_version = Column(Integer, nullable=False, default=0)
    must_change_password = Column(Boolean, nullable=False, default=False)
    created_at = Column(UTCDateTime, nullable=False, default=utcnow)
    updated_at = Column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def __repr__(self) -> str:
        return f"<User {self.username}>"
