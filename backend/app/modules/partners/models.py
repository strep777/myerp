from __future__ import annotations

from sqlalchemy import Boolean, Column, Integer, String

from app.core.database import Base, UTCDateTime, utcnow


class _PartnerMixin:
    id = Column(Integer, primary_key=True)
    code = Column(String(30), nullable=False, unique=True, index=True)
    name = Column(String(120), nullable=False)
    contact_person = Column(String(80), nullable=False, default="")
    phone = Column(String(40), nullable=False, default="")
    email = Column(String(120), nullable=False, default="")
    address = Column(String(240), nullable=False, default="")
    remark = Column(String(240), nullable=False, default="")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(UTCDateTime, nullable=False, default=utcnow)
    updated_at = Column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)


class Supplier(_PartnerMixin, Base):
    __tablename__ = "suppliers"


class Customer(_PartnerMixin, Base):
    __tablename__ = "customers"
