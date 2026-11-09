from __future__ import annotations

# Importing models registers them on Base.metadata before create_all().
from app.modules.ai.models import AiRun, AiSetting
from app.modules.audit.models import AuditLog
from app.modules.inbound.models import InboundLine, InboundOrder
from app.modules.inventory.models import InventoryBalance, InventoryLedger
from app.modules.outbound.models import OutboundLine, OutboundOrder
from app.modules.partners.models import Customer, Supplier
from app.modules.products.models import Product
from app.modules.stocktakes.models import Stocktake, StocktakeLine
from app.modules.transfers.models import TransferLine, TransferOrder
from app.modules.users.models import User
from app.modules.warehouses.models import Warehouse

__all__ = [
    "AiRun",
    "AiSetting",
    "AuditLog",
    "InboundLine",
    "InboundOrder",
    "InventoryBalance",
    "InventoryLedger",
    "OutboundLine",
    "OutboundOrder",
    "Customer",
    "Supplier",
    "Product",
    "Stocktake",
    "StocktakeLine",
    "TransferLine",
    "TransferOrder",
    "User",
    "Warehouse",
]
