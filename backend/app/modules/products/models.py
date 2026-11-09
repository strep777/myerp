from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Column, Index, Integer, Numeric, String

from app.core.database import Base, UTCDateTime, utcnow


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("safety_stock >= 0", name="ck_products_safety_stock"),
        CheckConstraint("reference_cost >= 0", name="ck_products_reference_cost"),
        CheckConstraint("reference_price >= 0", name="ck_products_reference_price"),
        Index("ix_products_name", "name"),
        Index("ix_products_category", "category"),
    )

    id = Column(Integer, primary_key=True)
    sku = Column(String(50), nullable=False, unique=True, index=True)
    name = Column(String(120), nullable=False)
    category = Column(String(60), nullable=False, default="")
    spec = Column(String(120), nullable=False, default="")
    unit = Column(String(20), nullable=False, default="件")
    barcode = Column(String(64), nullable=True, unique=True)
    safety_stock = Column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    reference_cost = Column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    reference_price = Column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    remark = Column(String(240), nullable=False, default="")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(UTCDateTime, nullable=False, default=utcnow)
    updated_at = Column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def __repr__(self) -> str:
        return f"<Product {self.sku}>"
