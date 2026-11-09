from __future__ import annotations

from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base, UTCDateTime, utcnow


class OutboundOrder(Base):
    __tablename__ = "outbound_orders"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT','CONFIRMED','CANCELLED')",
            name="ck_outbound_status",
        ),
        CheckConstraint("total_quantity >= 0", name="ck_outbound_total_qty"),
        Index("ix_outbound_status", "status"),
        Index("ix_outbound_created_at", "created_at"),
        Index("ix_outbound_warehouse", "warehouse_id"),
    )

    id = Column(Integer, primary_key=True)
    order_no = Column(String(40), nullable=False, unique=True, index=True)
    customer_id = Column(
        Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    related_no = Column(String(40), nullable=False, default="")
    expected_date = Column(Date, nullable=True)
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
        "OutboundLine",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OutboundLine.id",
    )


class OutboundLine(Base):
    __tablename__ = "outbound_lines"
    __table_args__ = (
        UniqueConstraint("order_id", "product_id", name="uq_outbound_line"),
        CheckConstraint("quantity > 0", name="ck_outbound_line_qty"),
        Index("ix_outbound_lines_order", "order_id"),
    )

    id = Column(Integer, primary_key=True)
    order_id = Column(
        Integer,
        ForeignKey("outbound_orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Numeric(18, 4), nullable=False)
    remark = Column(String(160), nullable=False, default="")

    order = relationship("OutboundOrder", back_populates="lines")
