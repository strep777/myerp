from __future__ import annotations

from sqlalchemy import Boolean, Column, Integer, String

from app.core.database import Base, UTCDateTime, utcnow


class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True)
    code = Column(String(30), nullable=False, unique=True, index=True)
    name = Column(String(80), nullable=False)
    location = Column(String(160), nullable=False, default="")
    manager = Column(String(80), nullable=False, default="")
    remark = Column(String(240), nullable=False, default="")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(UTCDateTime, nullable=False, default=utcnow)
    updated_at = Column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def __repr__(self) -> str:
        return f"<Warehouse {self.code}>"
