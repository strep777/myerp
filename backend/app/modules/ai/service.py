from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from copy import copy
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.audit import write_audit
from app.core.database import q4, utcnow
from app.core.errors import AppError
from app.modules.ai.crypto import encrypt_secret, mask_secret
from app.modules.ai.link_fetcher import fetch_link
from app.modules.ai.models import AiRun, AiSetting
from app.modules.ai.prompts import DEFAULT_AI_PROMPT, PROMPT_VERSION
from app.modules.ai.providers import analyze_with_provider, test_connection
from app.modules.ai.schemas import (
    AiAnalyzeOut,
    AiImportLine,
    AiImportOut,
    AiImportRequest,
    AiLinePreview,
    AiSettingsOut,
    AiSettingsUpdate,
    AiTestRequest,
)
from app.modules.inbound import service as inbound_service
from app.modules.inbound.schemas import InboundCreate, InboundLineIn
from app.modules.partners.models import Supplier
from app.modules.partners.schemas import PartnerCreate
from app.modules.partners.service import create_partner
from app.modules.products.models import Product
from app.modules.products.schemas import ProductCreate
from app.modules.products.service import create_product
from app.modules.users.models import User
from app.modules.warehouses.models import Warehouse


PREVIEW_TTL = timedelta(minutes=30)
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_PREVIEW_QUANTITY = Decimal("1000000000")
MAX_PREVIEW_MONEY = Decimal("1000000000000")


def _get_setting(db: Session) -> AiSetting:
    setting = db.get(AiSetting, 1)
    if setting is None:
        setting = AiSetting(id=1, default_prompt=DEFAULT_AI_PROMPT)
        db.add(setting)
        db.commit()
        db.refresh(setting)
    if not setting.default_prompt:
        setting.default_prompt = DEFAULT_AI_PROMPT
        db.commit()
    return setting


def serialize_settings(setting: AiSetting) -> AiSettingsOut:
    return AiSettingsOut(
        provider=setting.provider,
        deepseek_base_url=setting.deepseek_base_url,
        deepseek_model=setting.deepseek_model,
        deepseek_api_key_set=bool(setting.deepseek_api_key_enc),
        deepseek_api_key_hint=setting.deepseek_api_key_hint or "",
        ollama_base_url=setting.ollama_base_url,
        ollama_model=setting.ollama_model,
        default_prompt=setting.default_prompt or DEFAULT_AI_PROMPT,
        default_prompt_template=DEFAULT_AI_PROMPT,
        auto_confirm=bool(setting.auto_confirm),
        prompt_version=PROMPT_VERSION,
        updated_at=setting.updated_at,
    )


def get_settings(db: Session) -> AiSettingsOut:
    return serialize_settings(_get_setting(db))


def update_settings(
    db: Session, payload: AiSettingsUpdate, actor: User
) -> AiSettingsOut:
    setting = _get_setting(db)
    setting.provider = payload.provider
    setting.deepseek_base_url = payload.deepseek_base_url
    setting.deepseek_model = payload.deepseek_model
    setting.ollama_base_url = payload.ollama_base_url
    setting.ollama_model = payload.ollama_model
    setting.default_prompt = payload.default_prompt.strip() or DEFAULT_AI_PROMPT
    setting.auto_confirm = payload.auto_confirm
    if payload.clear_deepseek_api_key:
        setting.deepseek_api_key_enc = ""
        setting.deepseek_api_key_hint = ""
    elif payload.deepseek_api_key:
        setting.deepseek_api_key_enc = encrypt_secret(payload.deepseek_api_key)
        setting.deepseek_api_key_hint = mask_secret(payload.deepseek_api_key)
    write_audit(
        db,
        action="UPDATE",
        entity_type="ai_settings",
        entity_id=setting.id,
        entity_no="ai",
        summary="更新 AI 设置",
        detail={
            "provider": setting.provider,
            "model": (
                setting.ollama_model
                if setting.provider == "OLLAMA"
                else setting.deepseek_model
            ),
            "key_changed": bool(payload.deepseek_api_key or payload.clear_deepseek_api_key),
        },
        user=actor,
    )
    db.commit()
    db.refresh(setting)
    return serialize_settings(setting)


def _temporary_setting(setting: AiSetting, payload: AiTestRequest):
    transient = SimpleNamespace(
        provider=payload.provider or setting.provider,
        deepseek_base_url=(payload.deepseek_base_url or setting.deepseek_base_url).rstrip("/"),
        deepseek_model=payload.deepseek_model or setting.deepseek_model,
        deepseek_api_key_enc=setting.deepseek_api_key_enc,
        ollama_base_url=(payload.ollama_base_url or setting.ollama_base_url).rstrip("/"),
        ollama_model=payload.ollama_model or setting.ollama_model,
        default_prompt=setting.default_prompt,
    )
    if payload.deepseek_api_key:
        transient.deepseek_api_key_enc = encrypt_secret(payload.deepseek_api_key)
    return transient


def test_settings(db: Session, payload: AiTestRequest) -> Dict[str, Any]:
    setting = _get_setting(db)
    transient = _temporary_setting(setting, payload)
    return test_connection(transient)


def _source_from_input(
    image: Optional[Any], link: str, text: str
) -> Tuple[str, str, str, str]:
    """Return source_type, source_text, image_base64, image_mime."""
    if image is not None:
        raw = image
        # 4MB 原图经 base64 约 5.3MB，可稳定落在 6MB 的 AI 请求上限内。
        if len(raw) > MAX_IMAGE_BYTES:
            raise AppError(400, "AI_IMAGE_TOO_LARGE", "图片不能超过 4MB")
        if len(raw) < 8:
            raise AppError(400, "AI_IMAGE_INVALID", "图片内容无效")
        if raw.startswith(b"\x89PNG\r\n\x1a\n"):
            mime = "image/png"
        elif raw.startswith(b"\xff\xd8\xff"):
            mime = "image/jpeg"
        elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
            mime = "image/webp"
        elif raw[:6] in (b"GIF87a", b"GIF89a"):
            mime = "image/gif"
        else:
            raise AppError(400, "AI_IMAGE_INVALID", "只支持 PNG、JPEG、WebP、GIF 图片")
        import base64

        return (
            "IMAGE",
            text.strip() or "请分析这张购买凭证，提取商品和数量。",
            base64.b64encode(raw).decode("ascii"),
            mime,
        )

    if link.strip():
        fetched = fetch_link(link.strip())
        source_text = text.strip()
        if fetched["kind"] == "image":
            return (
                "LINK",
                source_text or f"商品图片链接：{fetched['url']}",
                fetched["image_base64"],
                fetched["mime"],
            )
        composed = "\n".join(
            part
            for part in (
                f"链接：{fetched['url']}",
                f"标题：{fetched['title']}",
                f"描述：{fetched['description']}",
                f"正文：\n{fetched['text']}",
                f"用户补充：{source_text}" if source_text else "",
            )
            if part
        )
        return "LINK", composed[:14000], "", ""

    value = text.strip()
    if len(value) < 8:
        raise AppError(400, "AI_SOURCE_EMPTY", "请输入商品文字、链接或上传截图")
    return "TEXT", value[:14000], "", ""


def _number(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None or value == "":
        return default
    try:
        number = Decimal(str(value).replace(",", "").replace("¥", "").strip())
    except (InvalidOperation, ValueError):
        return default
    if not number.is_finite():
        return default
    return number


def _clean_text(value: Any, limit: int, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()[:limit] or default


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    raw = str(value).strip()[:10]
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _match_products(db: Session, items: List[Dict[str, Any]]) -> Dict[str, Product]:
    barcodes = {item["barcode"] for item in items if item.get("barcode")}
    skus = {item["sku"].upper() for item in items if item.get("sku")}
    names = {item["name"].strip().lower() for item in items if item.get("name")}
    conditions = []
    if barcodes:
        conditions.append(Product.barcode.in_(barcodes))
    if skus:
        conditions.append(Product.sku.in_(skus))
    if names:
        conditions.append(func.lower(Product.name).in_(names))
    if not conditions:
        return {}
    products = db.query(Product).filter(or_(*conditions)).all()
    found: Dict[int, Product] = {}
    for product in products:
        found[product.id] = product
    return found


def _find_match(
    item: Dict[str, Any], products: Dict[int, Product]
) -> Optional[Product]:
    barcode = item.get("barcode") or ""
    sku = (item.get("sku") or "").upper()
    name = (item.get("name") or "").strip().lower()
    for product in products.values():
        if barcode and product.barcode == barcode:
            return product
    for product in products.values():
        if sku and product.sku.upper() == sku:
            return product
    for product in products.values():
        if name and product.name.strip().lower() == name:
            return product
    return None


def _normalize_preview(raw: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise AppError(502, "AI_BAD_RESPONSE", "模型返回结构异常")
    raw_items = raw.get("items")
    if not isinstance(raw_items, list):
        raise AppError(502, "AI_BAD_RESPONSE", "模型返回缺少 items 数组")
    warnings: List[str] = []
    source_warnings = raw.get("warnings")
    if isinstance(source_warnings, list):
        warnings.extend(_clean_text(item, 200) for item in source_warnings[:20] if item)
    items: List[Dict[str, Any]] = []
    for index, row in enumerate(raw_items[:50], start=1):
        if not isinstance(row, dict):
            continue
        name = _clean_text(row.get("name"), 120)
        if not name:
            warnings.append(f"第 {index} 行缺少商品名称，已跳过")
            continue
        quantity = _number(row.get("quantity"))
        if quantity <= 0:
            warnings.append(f"第 {index} 行数量无效，已跳过")
            continue
        if quantity > MAX_PREVIEW_QUANTITY:
            warnings.append(f"第 {index} 行数量超出支持上限，已跳过")
            continue
        unit_cost = max(_number(row.get("unit_cost")), Decimal("0"))
        reference_price = max(_number(row.get("reference_price")), Decimal("0"))
        if unit_cost > MAX_PREVIEW_MONEY:
            warnings.append(f"第 {index} 行单价超出支持上限，已按 0 处理")
            unit_cost = Decimal("0")
        if reference_price > MAX_PREVIEW_MONEY:
            warnings.append(f"第 {index} 行参考价超出支持上限，已按 0 处理")
            reference_price = Decimal("0")
        confidence = _number(row.get("confidence"), Decimal("0.5"))
        try:
            confidence = min(max(float(confidence), 0.0), 1.0)
        except (TypeError, ValueError):
            confidence = 0.5
        items.append(
            {
                "sku": _clean_text(row.get("sku"), 50),
                "name": name,
                "spec": _clean_text(row.get("spec"), 120),
                "category": _clean_text(row.get("category"), 60, "未分类"),
                "unit": _clean_text(row.get("unit"), 20, "件"),
                "barcode": _clean_text(row.get("barcode"), 64),
                "quantity": float(q4(quantity)),
                "unit_cost": float(q4(unit_cost)),
                "reference_price": float(q4(reference_price)),
                "confidence": round(confidence, 2),
            }
        )
    if not items:
        raise AppError(
            422,
            "AI_NO_ITEMS",
            "没有识别到可入库的商品，请换一张更清晰的截图或补充文字",
            {"warnings": "；".join(warnings[:5])} if warnings else None,
        )
    return {
        "source_summary": _clean_text(raw.get("source_summary"), 300, "AI 识别结果"),
        "supplier_name": _clean_text(raw.get("supplier_name"), 120),
        "order_date": _parse_date(raw.get("order_date")),
        "related_no": _clean_text(raw.get("related_no"), 40),
        "items": items,
        "warnings": warnings[:20],
    }


async def analyze(
    db: Session,
    actor: User,
    image: Optional[bytes],
    link: str,
    text: str,
    provider: Optional[str],
) -> AiAnalyzeOut:
    setting = _get_setting(db)
    if provider and provider.upper() not in ("DEEPSEEK", "OLLAMA"):
        raise AppError(400, "AI_PROVIDER_INVALID", "不支持的 AI 服务")
    transient = copy(setting)
    if provider:
        transient.provider = provider.upper()
    elif not transient.provider:
        transient.provider = "DEEPSEEK"

    if link.strip():
        # 链接抓取是阻塞网络调用，放到线程池，避免卡住事件循环。
        source_type, source_text, image_b64, image_mime = await run_in_threadpool(
            _source_from_input, image, link, text
        )
    else:
        source_type, source_text, image_b64, image_mime = _source_from_input(
            image, link, text
        )

    result = await run_in_threadpool(
        analyze_with_provider,
        transient,
        source_type,
        source_text,
        image_b64,
        image_mime,
    )
    normalized = _normalize_preview(result.data)
    matched = _match_products(db, normalized["items"])
    preview_items: List[AiLinePreview] = []
    for item in normalized["items"]:
        product = _find_match(item, matched)
        item_warnings: List[str] = []
        if product is not None:
            if not product.is_active:
                item_warnings.append("匹配到已停用商品，导入前请先启用或换一个商品")
            preview_items.append(
                AiLinePreview(
                    **item,
                    matched_product_id=product.id,
                    matched_product_name=product.name,
                    match_type="existing",
                    warnings=item_warnings,
                )
            )
        else:
            preview_items.append(
                AiLinePreview(
                    **item,
                    match_type="new",
                    warnings=item_warnings + ["将自动创建新商品"],
                )
            )

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    run = AiRun(
        token_hash=token_hash,
        provider=result.provider,
        model=result.model,
        source_type=source_type,
        source_summary=normalized["source_summary"][:500],
        prompt_version=PROMPT_VERSION,
        result_json=json.dumps(
            {
                "source_summary": normalized["source_summary"],
                "supplier_name": normalized["supplier_name"],
                "order_date": normalized["order_date"].isoformat()
                if normalized["order_date"]
                else None,
                "related_no": normalized["related_no"],
                "items": [item.model_dump() for item in preview_items],
                "warnings": normalized["warnings"],
            },
            ensure_ascii=False,
        ),
        status="PREVIEW",
        created_by=actor.id,
    )
    db.add(run)
    db.flush()
    write_audit(
        db,
        action="AI_ANALYZE",
        entity_type="ai_run",
        entity_id=run.id,
        entity_no=str(run.id),
        summary=f"AI 分析 {source_type}，识别 {len(preview_items)} 行",
        detail={
            "provider": result.provider,
            "model": result.model,
            "items": len(preview_items),
            "source": source_type,
        },
        user=actor,
    )
    db.commit()
    db.refresh(run)
    return AiAnalyzeOut(
        token=token,
        source_type=source_type,
        source_summary=normalized["source_summary"],
        provider=result.provider,
        model=result.model,
        prompt_version=PROMPT_VERSION,
        latency_ms=result.latency_ms,
        supplier_name=normalized["supplier_name"],
        order_date=normalized["order_date"],
        related_no=normalized["related_no"],
        items=preview_items,
        warnings=normalized["warnings"],
    )


def _resolve_supplier(
    db: Session,
    request: AiImportRequest,
    preview_supplier: str,
    actor: User,
) -> Optional[int]:
    if request.supplier_id:
        supplier = db.get(Supplier, request.supplier_id)
        if supplier is None:
            raise AppError(404, "SUPPLIER_NOT_FOUND", "供应商不存在")
        if not supplier.is_active:
            raise AppError(409, "SUPPLIER_INACTIVE", "供应商已停用")
        return supplier.id
    name = (request.supplier_name or preview_supplier or "").strip()
    if not name:
        return None
    supplier = (
        db.query(Supplier)
        .filter(func.lower(Supplier.name) == name.lower())
        .order_by(Supplier.id)
        .first()
    )
    if supplier is not None:
        if not supplier.is_active:
            raise AppError(409, "SUPPLIER_INACTIVE", "匹配到的供应商已停用")
        return supplier.id
    if not request.create_supplier:
        return None
    suffix = uuid.uuid4().hex[:6].upper()
    code = f"SUP-AI-{suffix}"
    created = create_partner(
        db,
        Supplier,
        PartnerCreate(code=code, name=name[:120], remark="AI 智能入库自动创建"),
        actor,
        "supplier",
    )
    return created.id


def _generate_sku(db: Session) -> str:
    prefix = f"AI-{date.today().strftime('%Y%m%d')}-"
    for _ in range(30):
        value = prefix + uuid.uuid4().hex[:6].upper()
        if not db.query(Product.id).filter(Product.sku == value).first():
            return value
    raise AppError(500, "AI_SKU_GENERATION_FAILED", "无法生成唯一 SKU，请稍后重试")


def _resolve_product(
    db: Session, line: AiImportLine, actor: User, created: List[str]
) -> Product:
    if line.product_id:
        product = db.get(Product, line.product_id)
        if product is None:
            raise AppError(404, "PRODUCT_NOT_FOUND", "选中的商品不存在")
        if not product.is_active:
            raise AppError(409, "PRODUCT_INACTIVE", "选中的商品已停用")
        return product

    product = None
    if line.barcode:
        product = db.query(Product).filter(Product.barcode == line.barcode).first()
    if product is None and line.sku:
        product = db.query(Product).filter(Product.sku == line.sku.upper()).first()
    if product is None and line.name:
        product = (
            db.query(Product)
            .filter(func.lower(Product.name) == line.name.lower())
            .order_by(Product.id)
            .first()
        )
    if product is not None:
        if not product.is_active:
            raise AppError(409, "PRODUCT_INACTIVE", f"商品 {product.name} 已停用")
        return product

    sku = line.sku.strip().upper() if line.sku else _generate_sku(db)
    if db.query(Product.id).filter(Product.sku == sku).first():
        raise AppError(
            409,
            "PRODUCT_SKU_CONFLICT",
            f"SKU {sku} 已被其他商品占用，请修改后重试",
            {"lines": sku},
        )
    if line.barcode and db.query(Product.id).filter(Product.barcode == line.barcode).first():
        raise AppError(
            409,
            "PRODUCT_BARCODE_CONFLICT",
            f"条码 {line.barcode} 已被其他商品占用，请修改后重试",
        )
    payload = ProductCreate(
        sku=sku,
        name=line.name,
        category=line.category or "未分类",
        spec=line.spec,
        unit=line.unit or "件",
        barcode=line.barcode or None,
        reference_cost=line.unit_cost,
        reference_price=line.reference_price,
        remark="AI 智能入库自动创建",
        is_active=True,
    )
    product = create_product(db, payload, actor, commit=False)
    created.append(product.sku)
    return product


def _get_run(db: Session, token: str, actor: User) -> AiRun:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    run = db.query(AiRun).filter(AiRun.token_hash == token_hash).first()
    if run is None or run.created_by != actor.id:
        raise AppError(404, "AI_PREVIEW_NOT_FOUND", "分析结果不存在或已过期")
    if run.status == "IMPORTED":
        raise AppError(
            409,
            "AI_PREVIEW_USED",
            "这次分析结果已经导入过，不能重复导入",
            {"order": str(run.imported_order_id or "")},
        )
    if run.status != "PREVIEW":
        raise AppError(409, "AI_PREVIEW_INVALID", "分析结果状态不可用，请重新分析")
    created_at = run.created_at
    if created_at.tzinfo is not None:
        created_at = created_at.replace(tzinfo=None)
    if utcnow().replace(tzinfo=None) - created_at > PREVIEW_TTL:
        raise AppError(409, "AI_PREVIEW_EXPIRED", "分析结果已超过 30 分钟，请重新分析")
    return run


def import_preview(
    db: Session, actor: User, request: AiImportRequest
) -> AiImportOut:
    run = _get_run(db, request.token, actor)
    try:
        preview = json.loads(run.result_json or "{}")
    except json.JSONDecodeError:
        raise AppError(500, "AI_PREVIEW_CORRUPT", "分析结果损坏，请重新分析")
    preview_supplier = str(preview.get("supplier_name") or "")
    warehouse = db.get(Warehouse, request.warehouse_id)
    if warehouse is None:
        raise AppError(404, "WAREHOUSE_NOT_FOUND", "仓库不存在")
    if not warehouse.is_active:
        raise AppError(409, "WAREHOUSE_INACTIVE", "仓库已停用")

    supplier_id = _resolve_supplier(db, request, preview_supplier, actor)
    created_products: List[str] = []
    merged: Dict[int, Dict[str, Any]] = {}
    for line in request.lines:
        product = _resolve_product(db, line, actor, created_products)
        current = merged.get(product.id)
        if current is None:
            merged[product.id] = {
                "product": product,
                "quantity": q4(line.quantity),
                "amount": q4(line.quantity * line.unit_cost),
                "remark": line.remark,
            }
        else:
            current["quantity"] = q4(current["quantity"] + q4(line.quantity))
            current["amount"] = q4(
                current["amount"] + q4(line.quantity * line.unit_cost)
            )
            if line.remark and line.remark not in current["remark"]:
                current["remark"] = (current["remark"] + "；" + line.remark)[:160]

    matched_count = max(0, len(merged) - len(created_products))

    inbound_lines: List[InboundLineIn] = []
    for row in merged.values():
        quantity = row["quantity"]
        unit_cost = q4(row["amount"] / quantity) if quantity else Decimal("0")
        inbound_lines.append(
            InboundLineIn(
                product_id=row["product"].id,
                quantity=quantity,
                unit_cost=unit_cost,
                remark=(row["remark"] or "AI 智能入库")[:160],
            )
        )
    payload = InboundCreate(
        supplier_id=supplier_id,
        warehouse_id=request.warehouse_id,
        related_no=request.related_no or str(preview.get("related_no") or "")[:40],
        expected_date=request.expected_date,
        remark=(request.remark or f"AI 智能入库 · {run.source_summary}")[:240],
        lines=inbound_lines,
    )
    order = inbound_service.create_order(db, payload, actor)
    auto_confirmed = False
    if request.auto_confirm:
        try:
            order = inbound_service.confirm_order(db, order["id"], actor)
            auto_confirmed = True
        except AppError as exc:
            try:
                inbound_service.delete_order(db, order["id"], actor)
            except Exception:
                pass
            run.status = "FAILED"
            db.commit()
            raise AppError(
                409,
                "AI_IMPORT_CONFIRM_FAILED",
                f"入库草稿已创建但确认失败：{exc.detail}",
                {"order_id": str(order["id"])},
            )
    run.status = "IMPORTED"
    run.imported_order_id = order["id"]
    run.imported_at = utcnow()
    write_audit(
        db,
        action="AI_IMPORT",
        entity_type="inbound_order",
        entity_id=order["id"],
        entity_no=order["order_no"],
        summary=f"AI 导入入库单 {order['order_no']}",
        detail={
            "created_products": created_products,
            "lines": len(inbound_lines),
            "auto_confirmed": auto_confirmed,
            "source": run.source_type,
        },
        user=actor,
    )
    db.commit()
    return AiImportOut(
        order_id=order["id"],
        order_no=order["order_no"],
        status=order["status"],
        created_products=created_products,
        matched_products=matched_count,
        total_quantity=float(order.get("total_quantity") or 0),
        total_amount=float(order.get("total_amount") or 0),
        auto_confirmed=auto_confirmed,
        message=(
            "已确认入库，库存已更新"
            if auto_confirmed
            else "已保存为草稿，请到入库单确认后更新库存"
        ),
    )
