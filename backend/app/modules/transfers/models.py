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


class TransferOrder(Base):
    __tablename__ = "transfer_orders"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT','CONFIRMED','CANCELLED')",
            name="ck_transfer_status",
        ),
        CheckConstraint(
            "from_warehouse_id <> to_warehouse_id",
            name="ck_transfer_diff_warehouse",
        ),
        CheckConstraint("total_quantity >= 0", name="ck_transfer_total_qty"),
        Index("ix_transfer_status", "status"),
        Index("ix_transfer_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    order_no = Column(String(40), nullable=False, unique=True, index=True)
    from_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    to_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    status = Column(String(20), nullable=False, default="DRAFT")
    remark = Column(String(240), nullable=False, default="")
    total_quantity = Column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    confirmed_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    confirmed_at = Column(UTCDateTime, nullable=True)
    created_at = Column(UTCDateTime, nullable=False, default=utcnow)
    updated_at = Column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)

    lines = relationship(
        "TransferLine",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="TransferLine.id",
    )


class TransferLine(Base):
    __tablename__ = "transfer_lines"
    __table_args__ = (
        UniqueConstraint("order_id", "product_id", name="uq_transfer_line"),
        CheckConstraint("quantity > 0", name="ck_transfer_line_qty"),
        Index("ix_transfer_lines_order", "order_id"),
    )

    id = Column(Integer, primary_key=True)
    order_id = Column(
        Integer,
        ForeignKey("transfer_orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Numeric(18, 4), nullable=False)
    remark = Column(String(160), nullable=False, default="")

    order = relationship("TransferOrder", back_populates="lines")
