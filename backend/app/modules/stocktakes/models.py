from __future__ import annotations

from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base, UTCDateTime, utcnow


class Stocktake(Base):
    __tablename__ = "stocktakes"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT','COUNTING','COMPLETED','CANCELLED')",
            name="ck_stocktake_status",
        ),
        Index("ix_stocktake_status", "status"),
        Index("ix_stocktake_warehouse", "warehouse_id"),
        Index("ix_stocktake_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    stocktake_no = Column(String(40), nullable=False, unique=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    status = Column(String(20), nullable=False, default="DRAFT")
    remark = Column(String(240), nullable=False, default="")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    completed_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    completed_at = Column(UTCDateTime, nullable=True)
    created_at = Column(UTCDateTime, nullable=False, default=utcnow)
    updated_at = Column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)

    lines = relationship(
        "StocktakeLine",
        back_populates="stocktake",
        cascade="all, delete-orphan",
        order_by="StocktakeLine.id",
    )


class StocktakeLine(Base):
    __tablename__ = "stocktake_lines"
    __table_args__ = (
        UniqueConstraint("stocktake_id", "product_id", name="uq_stocktake_line"),
        CheckConstraint("book_quantity >= 0", name="ck_stocktake_line_book"),
        CheckConstraint("counted_quantity >= 0", name="ck_stocktake_line_counted"),
        Index("ix_stocktake_lines_stocktake", "stocktake_id"),
    )

    id = Column(Integer, primary_key=True)
    stocktake_id = Column(
        Integer,
        ForeignKey("stocktakes.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    book_quantity = Column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    counted_quantity = Column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    difference_quantity = Column(
        Numeric(18, 4), nullable=False, default=Decimal("0")
    )
    remark = Column(String(160), nullable=False, default="")

    stocktake = relationship("Stocktake", back_populates="lines")
