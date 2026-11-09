from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import NonNegativeQuantity


ProviderName = Literal["DEEPSEEK", "OLLAMA"]


class AiSettingsUpdate(BaseModel):
    provider: ProviderName = "DEEPSEEK"
    deepseek_base_url: str = Field(default="https://api.deepseek.com", max_length=200)
    deepseek_model: str = Field(default="deepseek-flash", max_length=80)
    deepseek_api_key: Optional[str] = Field(default=None, max_length=300)
    clear_deepseek_api_key: bool = False
    ollama_base_url: str = Field(default="http://127.0.0.1:11434", max_length=200)
    ollama_model: str = Field(default="qwen3.5:9b", max_length=80)
    default_prompt: str = Field(default="", max_length=20000)
    auto_confirm: bool = True

    @field_validator("provider", mode="before")
    @classmethod
    def upper_provider(cls, value: Any) -> Any:
        return value.upper() if isinstance(value, str) else value

    @field_validator("deepseek_base_url", "ollama_base_url")
    @classmethod
    def normalize_base_url(cls, value: str) -> str:
        value = (value or "").strip().rstrip("/")
        if not value:
            raise ValueError("服务地址不能为空")
        if not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError("服务地址必须以 http:// 或 https:// 开头")
        if "@" in value.split("://", 1)[1].split("/", 1)[0]:
            raise ValueError("服务地址不能包含账号密码")
        return value

    @field_validator("deepseek_model", "ollama_model")
    @classmethod
    def normalize_model(cls, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise ValueError("模型名称不能为空")
        return value

    @field_validator("deepseek_api_key")
    @classmethod
    def normalize_key(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class AiSettingsOut(BaseModel):
    provider: str
    deepseek_base_url: str
    deepseek_model: str
    deepseek_api_key_set: bool
    deepseek_api_key_hint: str
    ollama_base_url: str
    ollama_model: str
    default_prompt: str
    default_prompt_template: str
    auto_confirm: bool
    prompt_version: str
    updated_at: Optional[datetime] = None


class AiTestRequest(BaseModel):
    provider: Optional[ProviderName] = None
    deepseek_base_url: Optional[str] = Field(default=None, max_length=200)
    deepseek_model: Optional[str] = Field(default=None, max_length=80)
    deepseek_api_key: Optional[str] = Field(default=None, max_length=300)
    ollama_base_url: Optional[str] = Field(default=None, max_length=200)
    ollama_model: Optional[str] = Field(default=None, max_length=80)

    @field_validator("provider", mode="before")
    @classmethod
    def upper_provider(cls, value: Any) -> Any:
        return value.upper() if isinstance(value, str) else value


class AiLinePreview(BaseModel):
    sku: str = ""
    name: str
    spec: str = ""
    category: str = "未分类"
    unit: str = "件"
    barcode: str = ""
    quantity: float = Field(gt=0, le=1_000_000_000)
    unit_cost: float = Field(ge=0, le=1_000_000_000_000)
    reference_price: float = Field(default=0, ge=0, le=1_000_000_000_000)
    confidence: float = Field(default=0.5, ge=0, le=1)
    matched_product_id: Optional[int] = None
    matched_product_name: str = ""
    match_type: Literal["existing", "new"] = "new"
    warnings: List[str] = Field(default_factory=list)


class AiAnalyzeOut(BaseModel):
    token: str
    source_type: str
    source_summary: str
    provider: str
    model: str
    prompt_version: str
    latency_ms: int = 0
    supplier_name: str = ""
    order_date: Optional[date] = None
    related_no: str = ""
    items: List[AiLinePreview]
    warnings: List[str] = Field(default_factory=list)


class AiImportLine(BaseModel):
    product_id: Optional[int] = None
    sku: str = Field(default="", max_length=50)
    name: str = Field(min_length=1, max_length=120)
    spec: str = Field(default="", max_length=120)
    category: str = Field(default="未分类", max_length=60)
    unit: str = Field(default="件", max_length=20)
    barcode: str = Field(default="", max_length=64)
    quantity: Decimal = Field(gt=0, le=1_000_000_000)
    unit_cost: NonNegativeQuantity = Decimal("0")
    reference_price: NonNegativeQuantity = Decimal("0")
    remark: str = Field(default="", max_length=160)

    @field_validator("sku", "name", "spec", "category", "unit", "barcode", "remark")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return (value or "").strip()


class AiImportRequest(BaseModel):
    token: str = Field(min_length=20, max_length=128)
    warehouse_id: int
    supplier_id: Optional[int] = None
    supplier_name: str = Field(default="", max_length=120)
    create_supplier: bool = True
    related_no: str = Field(default="", max_length=40)
    remark: str = Field(default="", max_length=240)
    expected_date: Optional[date] = None
    auto_confirm: bool = True
    lines: List[AiImportLine] = Field(min_length=1, max_length=50)

    @field_validator("supplier_name", "related_no", "remark")
    @classmethod
    def strip_optional_text(cls, value: str) -> str:
        return (value or "").strip()


class AiImportOut(BaseModel):
    order_id: int
    order_no: str
    status: str
    created_products: List[str] = Field(default_factory=list)
    matched_products: int = 0
    total_quantity: float
    total_amount: float
    auto_confirmed: bool
    message: str = ""


class AiTestOut(BaseModel):
    ok: bool
    provider: str
    model: str
    model_available: bool = True
    models: List[str] = Field(default_factory=list)
    reply: str = ""
    latency_ms: int = 0
    message: str = ""
    detail: Any = None
