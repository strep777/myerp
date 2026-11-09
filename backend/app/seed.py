from __future__ import annotations

import logging
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.modules.partners.models import Customer, Supplier
from app.modules.inventory import service as inventory_service
from app.modules.products.models import Product
from app.modules.users.models import User
from app.modules.warehouses.models import Warehouse


logger = logging.getLogger("lager.seed")


def ensure_admin(db: Session) -> User:
    user = db.query(User).filter(User.username == "admin").first()
    if user is not None:
        return user
    if db.query(User.id).first() is not None:
        # Users exist but the conventional admin account was renamed/removed.
        return db.query(User).order_by(User.id.asc()).first()
    user = User(
        username="admin",
        password_hash=hash_password(settings.admin_initial_password),
        display_name="系统管理员",
        role="ADMIN",
        is_active=True,
        token_version=1,
        must_change_password=True,
    )
    db.add(user)
    db.flush()
    logger.info("Created initial administrator account 'admin'")
    return user


def seed_demo(db: Session, admin: User) -> None:
    # Demo master data is all-or-nothing. If the database already contains
    # warehouses or products, the user has started working (or deliberately
    # cleared the catalog); never try to insert seed rows again. This also
    # covers a catalog that was emptied from the UI while demo warehouses
    # remained, which previously caused a UNIQUE(warehouses.code) startup error.
    if (
        db.query(Warehouse.id).first() is not None
        or db.query(Product.id).first() is not None
    ):
        return

    sh = Warehouse(
        code="SH",
        name="上海主仓",
        location="上海市浦东新区示例路 88 号",
        manager="张伟",
        remark="演示主仓",
        is_active=True,
    )
    gz = Warehouse(
        code="GZ",
        name="广州分仓",
        location="广州市天河区示例大道 66 号",
        manager="李敏",
        remark="演示分仓",
        is_active=True,
    )
    db.add_all([sh, gz])
    db.flush()

    products = [
        Product(
            sku="OFF-001",
            name="A4 复印纸 70g",
            category="办公用品",
            spec="500 张/包",
            unit="包",
            barcode="6900000000011",
            safety_stock=Decimal("30"),
            reference_cost=Decimal("18.50"),
            reference_price=Decimal("25.00"),
            remark="常用办公耗材",
        ),
        Product(
            sku="OFF-002",
            name="黑色中性笔 0.5mm",
            category="办公用品",
            spec="12 支/盒",
            unit="盒",
            barcode="6900000000028",
            safety_stock=Decimal("20"),
            reference_cost=Decimal("12.00"),
            reference_price=Decimal("18.00"),
        ),
        Product(
            sku="ELC-001",
            name="USB-C 数据线 1m",
            category="电子配件",
            spec="1 米，编织线",
            unit="条",
            barcode="6900000000035",
            safety_stock=Decimal("15"),
            reference_cost=Decimal("16.00"),
            reference_price=Decimal("29.00"),
        ),
        Product(
            sku="ELC-002",
            name="无线鼠标",
            category="电子配件",
            spec="2.4G 接收器",
            unit="个",
            barcode="6900000000042",
            safety_stock=Decimal("8"),
            reference_cost=Decimal("45.00"),
            reference_price=Decimal("79.00"),
        ),
        Product(
            sku="ELC-003",
            name="65W 氮化镓充电器",
            category="电子配件",
            spec="双 Type-C 口",
            unit="个",
            barcode="6900000000059",
            safety_stock=Decimal("6"),
            reference_cost=Decimal("89.00"),
            reference_price=Decimal("149.00"),
        ),
        Product(
            sku="PKG-001",
            name="瓦楞纸箱 40×30×30",
            category="包装耗材",
            spec="5 层加厚",
            unit="个",
            barcode="6900000000066",
            safety_stock=Decimal("50"),
            reference_cost=Decimal("4.20"),
            reference_price=Decimal("6.50"),
        ),
        Product(
            sku="PKG-002",
            name="透明封箱胶带",
            category="包装耗材",
            spec="宽 48mm × 100m",
            unit="卷",
            barcode="6900000000073",
            safety_stock=Decimal("24"),
            reference_cost=Decimal("3.60"),
            reference_price=Decimal("6.00"),
        ),
        Product(
            sku="OFF-003",
            name="桌面文件收纳盒",
            category="办公用品",
            spec="A4 横版，三层",
            unit="个",
            barcode="6900000000080",
            safety_stock=Decimal("5"),
            reference_cost=Decimal("28.00"),
            reference_price=Decimal("49.00"),
        ),
    ]
    db.add_all(products)
    db.flush()

    suppliers = [
        Supplier(
            code="SUP-001",
            name="上海晨光办公用品有限公司",
            contact_person="王经理",
            phone="021-5555-0101",
            email="sales@example.com",
            address="上海市奉贤区示例工业园 1 号",
        ),
        Supplier(
            code="SUP-002",
            name="深圳数码配件有限公司",
            contact_person="李经理",
            phone="0755-5555-0202",
            email="service@example.com",
            address="深圳市南山区示例科技园 2 栋",
        ),
    ]
    customers = [
        Customer(
            code="CUS-001",
            name="杭州云帆科技有限公司",
            contact_person="张女士",
            phone="0571-5555-0303",
            email="buyer@example.com",
            address="杭州市余杭区示例路 18 号",
        ),
        Customer(
            code="CUS-002",
            name="南京青禾商贸有限公司",
            contact_person="陈先生",
            phone="025-5555-0404",
            email="purchase@example.com",
            address="南京市建邺区示例街 9 号",
        ),
    ]
    db.add_all(suppliers + customers)
    db.flush()

    opening = {
        "OFF-001": ("120", "18.50"),
        "OFF-002": ("45", "12.00"),
        "ELC-001": ("32", "16.00"),
        "ELC-002": ("6", "45.00"),
        "ELC-003": ("12", "89.00"),
        "PKG-001": ("180", "4.20"),
        "PKG-002": ("60", "3.60"),
    }
    for product in products:
        if product.sku not in opening:
            continue
        quantity, cost = opening[product.sku]
        inventory_service.apply_movement(
            db,
            product_id=product.id,
            warehouse_id=sh.id,
            change_qty=Decimal(quantity),
            movement_type="ADJUSTMENT",
            ref_type="ADJUST",
            ref_id=None,
            ref_no="OPENING-SEED",
            unit_cost=Decimal(cost),
            remark="演示期初库存",
            actor_id=admin.id,
        )
    db.commit()
    logger.info("Demo master data and opening stock created")


def run_seed() -> None:
    db = SessionLocal()
    try:
        admin = ensure_admin(db)
        db.commit()
        if settings.seed_demo_data:
            try:
                seed_demo(db, admin)
            except Exception:
                # Demo data is optional. A stale/partially populated database
                # must not prevent the application from starting.
                db.rollback()
                logger.exception("Demo seed skipped; continuing startup")
    except Exception:
        db.rollback()
        logger.exception("Seeding failed")
        raise
    finally:
        db.close()
