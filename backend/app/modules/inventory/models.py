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

from app.core.database import Base, UTCDateTime, utcnow


class InventoryBalance(Base):
    __tablename__ = "inventory_balances"
    __table_args__ = (
        UniqueConstraint("product_id", "warehouse_id", name="uq_balances_product_warehouse"),
        CheckConstraint("quantity >= 0", name="ck_balances_quantity"),
        CheckConstraint("avg_cost >= 0", name="ck_balances_avg_cost"),
        Index("ix_balances_warehouse", "warehouse_id"),
        Index("ix_balances_product", "product_id"),
    )

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    quantity = Column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    avg_cost = Column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    updated_at = Column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)


class InventoryLedger(Base):
    __tablename__ = "inventory_ledger"
    __table_args__ = (
        CheckConstraint("change_qty <> 0", name="ck_ledger_change_qty"),
        CheckConstraint("balance_after >= 0", name="ck_ledger_balance_after"),
        Index("ix_ledger_product_time", "product_id", "created_at"),
        Index("ix_ledger_warehouse_time", "warehouse_id", "created_at"),
        Index("ix_ledger_ref", "ref_type", "ref_id"),
        Index("ix_ledger_type_time", "movement_type", "created_at"),
        Index("ix_ledger_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    movement_type = Column(String(30), nullable=False)
    change_qty = Column(Numeric(18, 4), nullable=False)
    unit_cost = Column(Numeric(18, 4), nullable=False, default=Decimal("0"))
    balance_after = Column(Numeric(18, 4), nullable=False)
    ref_type = Column(String(20), nullable=False)
    ref_id = Column(Integer, nullable=True)
    ref_no = Column(String(40), nullable=False, default="")
    remark = Column(String(240), nullable=False, default="")
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(UTCDateTime, nullable=False, default=utcnow)
