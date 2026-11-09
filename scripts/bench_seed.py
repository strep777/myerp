"""Create a synthetic performance database for Lager.

Run from F:\\erp\\backend:
    ..\\.venv\\Scripts\\python.exe ..\\scripts\\bench_seed.py

The database contains 10k products, 5 warehouses, 100k ledger rows,
10k documents, 20k document lines and 30k audit rows. It is intentionally
separate from the demo database.
"""

from __future__ import annotations

import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

DB_PATH = Path("F:/erp/data/perf.db")
os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH.as_posix()}"
os.environ["SEED_DEMO_DATA"] = "false"

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.modules.audit.models import AuditLog  # noqa: E402
from app.modules.inbound.models import InboundLine, InboundOrder  # noqa: E402
from app.modules.inventory.models import InventoryBalance, InventoryLedger  # noqa: E402
from app.modules.outbound.models import OutboundLine, OutboundOrder  # noqa: E402
from app.modules.partners.models import Customer, Supplier  # noqa: E402
from app.modules.products.models import Product  # noqa: E402
from app.modules.transfers.models import TransferLine, TransferOrder  # noqa: E402
from app.modules.users.models import User  # noqa: E402
from app.modules.warehouses.models import Warehouse  # noqa: E402

random.seed(20261109)
NOW = datetime.now(timezone.utc)
CATEGORIES = ["电子配件", "办公用品", "包装耗材", "清洁用品", "五金工具"]


def chunks(items, size=5000):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def main() -> None:
    started = time.perf_counter()
    if DB_PATH.exists():
        for suffix in ("", "-wal", "-shm"):
            path = Path(str(DB_PATH) + suffix)
            if path.exists():
                path.unlink()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        admin = User(
            username="admin",
            password_hash=hash_password("Admin@12345"),
            display_name="性能管理员",
            role="ADMIN",
            is_active=True,
            token_version=0,
            must_change_password=False,
        )
        db.add(admin)
        db.flush()

        warehouses = []
        for index in range(1, 6):
            warehouses.append(
                Warehouse(
                    code=f"PERF-W{index}",
                    name=f"性能仓 {index}",
                    location=f"测试城市 {index}",
                    manager="性能测试",
                    remark="benchmark",
                    is_active=True,
                )
            )
        db.add_all(warehouses)
        db.flush()
        warehouse_ids = [warehouse.id for warehouse in warehouses]

        suppliers = [
            Supplier(code=f"PERF-S{index:03d}", name=f"性能供应商 {index}", is_active=True)
            for index in range(1, 201)
        ]
        customers = [
            Customer(code=f"PERF-C{index:03d}", name=f"性能客户 {index}", is_active=True)
            for index in range(1, 201)
        ]
        db.add_all(suppliers + customers)
        db.flush()
        supplier_ids = [item.id for item in suppliers]
        customer_ids = [item.id for item in customers]

        products = [
            {
                "sku": f"PERF-{index:06d}",
                "name": f"性能测试商品 {index:06d}",
                "category": CATEGORIES[index % len(CATEGORIES)],
                "spec": f"规格-{index % 50}",
                "unit": "个",
                "barcode": None,
                "safety_stock": 10,
                "reference_cost": 8,
                "reference_price": 12,
                "remark": "",
                "is_active": True,
                "created_at": NOW - timedelta(days=random.randint(0, 365)),
                "updated_at": NOW,
            }
            for index in range(1, 10001)
        ]
        for batch in chunks(products):
            db.execute(Product.__table__.insert(), batch)
        product_ids = [row[0] for row in db.query(Product.id).order_by(Product.id).all()]

        balances = [
            {
                "product_id": product_id,
                "warehouse_id": warehouse_ids[index % len(warehouse_ids)],
                "quantity": 1000,
                "avg_cost": 10,
                "updated_at": NOW - timedelta(days=index % 30),
            }
            for index, product_id in enumerate(product_ids)
        ]
        for batch in chunks(balances):
            db.execute(InventoryBalance.__table__.insert(), batch)

        ledger = []
        for index, product_id in enumerate(product_ids):
            warehouse_id = warehouse_ids[index % len(warehouse_ids)]
            for seq in range(10):
                when = NOW - timedelta(days=random.randint(0, 364), seconds=seq)
                change = 20 if seq % 2 == 0 else -15
                ledger.append(
                    {
                        "product_id": product_id,
                        "warehouse_id": warehouse_id,
                        "movement_type": "INBOUND" if change > 0 else "OUTBOUND",
                        "change_qty": change,
                        "unit_cost": 10,
                        "balance_after": 1000 + seq * change,
                        "ref_type": "INBOUND" if change > 0 else "OUTBOUND",
                        "ref_id": index * 10 + seq,
                        "ref_no": f"PERF-{index:06d}-{seq}",
                        "remark": "",
                        "created_by": admin.id,
                        "created_at": when,
                    }
                )
        for batch in chunks(ledger):
            db.execute(InventoryLedger.__table__.insert(), batch)

        inbound_orders = []
        outbound_orders = []
        transfer_orders = []
        for index in range(1, 3334):
            when = NOW - timedelta(hours=index * 2)
            status = "CONFIRMED" if index % 5 else "DRAFT"
            inbound_orders.append(
                {
                    "order_no": f"IN-2026{index:06d}",
                    "supplier_id": supplier_ids[index % len(supplier_ids)],
                    "warehouse_id": warehouse_ids[index % len(warehouse_ids)],
                    "related_no": f"PO-{index:06d}",
                    "expected_date": None,
                    "status": status,
                    "remark": "",
                    "total_quantity": 20,
                    "total_amount": 200,
                    "created_by": admin.id,
                    "confirmed_by": admin.id if status == "CONFIRMED" else None,
                    "confirmed_at": when if status == "CONFIRMED" else None,
                    "created_at": when,
                    "updated_at": when,
                }
            )
            outbound_orders.append(
                {
                    "order_no": f"OUT-2026{index:06d}",
                    "customer_id": customer_ids[index % len(customer_ids)],
                    "warehouse_id": warehouse_ids[index % len(warehouse_ids)],
                    "related_no": f"SO-{index:06d}",
                    "expected_date": None,
                    "status": status,
                    "remark": "",
                    "total_quantity": 20,
                    "created_by": admin.id,
                    "confirmed_by": admin.id if status == "CONFIRMED" else None,
                    "confirmed_at": when if status == "CONFIRMED" else None,
                    "created_at": when,
                    "updated_at": when,
                }
            )
            transfer_orders.append(
                {
                    "order_no": f"TRF-2026{index:06d}",
                    "from_warehouse_id": warehouse_ids[0],
                    "to_warehouse_id": warehouse_ids[1 + index % 4],
                    "status": status,
                    "remark": "",
                    "total_quantity": 20,
                    "created_by": admin.id,
                    "confirmed_by": admin.id if status == "CONFIRMED" else None,
                    "confirmed_at": when if status == "CONFIRMED" else None,
                    "created_at": when,
                    "updated_at": when,
                }
            )

        for batch in chunks(inbound_orders):
            db.execute(InboundOrder.__table__.insert(), batch)
        for batch in chunks(outbound_orders):
            db.execute(OutboundOrder.__table__.insert(), batch)
        for batch in chunks(transfer_orders):
            db.execute(TransferOrder.__table__.insert(), batch)

        inbound_ids = [row[0] for row in db.query(InboundOrder.id).all()]
        outbound_ids = [row[0] for row in db.query(OutboundOrder.id).all()]
        transfer_ids = [row[0] for row in db.query(TransferOrder.id).all()]

        inbound_lines = []
        outbound_lines = []
        transfer_lines = []
        for order_id in inbound_ids:
            for offset in range(2):
                inbound_lines.append(
                    {
                        "order_id": order_id,
                        "product_id": product_ids[(order_id * 2 + offset) % len(product_ids)],
                        "quantity": 10,
                        "unit_cost": 10,
                        "amount": 100,
                        "remark": "",
                    }
                )
        for order_id in outbound_ids:
            for offset in range(2):
                outbound_lines.append(
                    {
                        "order_id": order_id,
                        "product_id": product_ids[(order_id * 2 + offset) % len(product_ids)],
                        "quantity": 10,
                        "remark": "",
                    }
                )
        for order_id in transfer_ids:
            for offset in range(2):
                transfer_lines.append(
                    {
                        "order_id": order_id,
                        "product_id": product_ids[(order_id * 2 + offset) % len(product_ids)],
                        "quantity": 10,
                        "remark": "",
                    }
                )
        for batch in chunks(inbound_lines):
            db.execute(InboundLine.__table__.insert(), batch)
        for batch in chunks(outbound_lines):
            db.execute(OutboundLine.__table__.insert(), batch)
        for batch in chunks(transfer_lines):
            db.execute(TransferLine.__table__.insert(), batch)

        actions = ["CREATE", "UPDATE", "CONFIRM", "LOGIN", "ADJUST"]
        audits = [
            {
                "user_id": admin.id,
                "username_snapshot": "admin",
                "action": actions[index % len(actions)],
                "entity_type": "INBOUND" if index % 2 else "PRODUCT",
                "entity_id": index,
                "entity_no": f"PERF-{index:06d}",
                "summary": f"性能审计记录 {index}",
                "detail": '{"source":"benchmark"}',
                "ip": "127.0.0.1",
                "created_at": NOW - timedelta(minutes=index),
            }
            for index in range(1, 30001)
        ]
        for batch in chunks(audits):
            db.execute(AuditLog.__table__.insert(), batch)

        db.commit()
        counts = {
            "users": db.query(User).count(),
            "products": db.query(Product).count(),
            "warehouses": db.query(Warehouse).count(),
            "balances": db.query(InventoryBalance).count(),
            "ledger": db.query(InventoryLedger).count(),
            "inbound": db.query(InboundOrder).count(),
            "outbound": db.query(OutboundOrder).count(),
            "transfers": db.query(TransferOrder).count(),
            "audit": db.query(AuditLog).count(),
        }
        print("SEEDED", counts)
        print(f"DATABASE {DB_PATH} {DB_PATH.stat().st_size / 1024 / 1024:.1f} MB")
        print(f"ELAPSED {time.perf_counter() - started:.1f}s")
    finally:
        db.close()


if __name__ == "__main__":
    main()
