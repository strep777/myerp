from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

from app.core.errors import AppError
from app.modules.ai.crypto import decrypt_secret
from app.modules.ai.models import AiSetting
from app.modules.ai.prompts import DEFAULT_AI_PROMPT, PROMPT_VERSION, SYSTEM_PROMPT


@dataclass
class ProviderResult:
    data: Dict[str, Any]
    raw_text: str
    provider: str
    model: str
    latency_ms: int
    usage: Dict[str, Any]


class ProviderFailure(AppError):
    pass


def _extract_json(text: str) -> Dict[str, Any]:
    value = (text or "").strip()
    if not value:
        raise ProviderFailure(502, "AI_EMPTY_RESPONSE", "模型没有返回内容")
    if value.startswith("```"):
        value = re.sub(r"^```(?:json)?\s*", "", value, flags=re.IGNORECASE)
        value = re.sub(r"\s*```$", "", value)
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        start = value.find("{")
        end = value.rfind("}")
        if start < 0 or end <= start:
            raise ProviderFailure(502, "AI_BAD_JSON", "模型返回的不是有效 JSON")
        try:
            parsed = json.loads(value[start : end + 1])
        except json.JSONDecodeError:
            raise ProviderFailure(502, "AI_BAD_JSON", "模型返回的 JSON 无法解析")
    if not isinstance(parsed, dict):
        raise ProviderFailure(502, "AI_BAD_JSON", "模型返回的 JSON 顶层必须是对象")
    return parsed


def _error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
        if isinstance(body, dict):
            error = body.get("error")
            if isinstance(error, dict):
                return str(error.get("message") or error.get("code") or "")[:300]
            if isinstance(error, str):
                return error[:300]
            if body.get("message"):
                return str(body["message"])[:300]
    except Exception:
        pass
    return (response.text or "")[:300]


def _raise_http_error(response: httpx.Response, provider: str) -> None:
    status = response.status_code
    detail = _error_detail(response)
    if status in (401, 403):
        raise ProviderFailure(
            502, "AI_AUTH_FAILED", f"{provider} 鉴权失败，请检查 API Key"
        )
    if status == 429:
        raise ProviderFailure(
            429, "AI_RATE_LIMITED", f"{provider} 请求过于频繁，请稍后重试"
        )
    if status == 404 and provider == "Ollama":
        raise ProviderFailure(
            400,
            "AI_MODEL_NOT_FOUND",
            detail or "Ollama 中找不到该模型，请先 ollama pull",
        )
    raise ProviderFailure(
        502,
        "AI_PROVIDER_ERROR",
        f"{provider} 返回 HTTP {status}" + (f"：{detail}" if detail else ""),
    )


def _request_json(
    url: str,
    payload: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None,
    timeout: float = 90.0,
    provider_label: str = "模型服务",
) -> Dict[str, Any]:
    try:
        with httpx.Client(timeout=timeout, follow_redirects=False, trust_env=False) as client:
            response = client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException:
        raise ProviderFailure(504, "AI_TIMEOUT", "模型响应超时，请稍后重试")
    except httpx.HTTPError:
        raise ProviderFailure(
            502, "AI_NETWORK_ERROR", f"无法连接 {provider_label}，请检查地址与网络"
        )
    if response.status_code >= 400:
        _raise_http_error(response, provider_label)
    try:
        data = response.json()
    except ValueError:
        raise ProviderFailure(502, "AI_BAD_RESPONSE", "模型服务返回了无法解析的响应")
    if not isinstance(data, dict):
        raise ProviderFailure(502, "AI_BAD_RESPONSE", "模型服务返回格式异常")
    return data


def list_ollama_models(base_url: str = "http://127.0.0.1:11434") -> List[Dict[str, Any]]:
    """Return models exposed by the Ollama instance at *base_url*.

    The model must never be hard-coded in the UI: the user may have pulled
    ``qwen3:8b``, ``llama3.2`` or a private tag.  This endpoint is read-only
    and intentionally does not require a model name.
    """
    base = (base_url or "http://127.0.0.1:11434").strip().rstrip("/")
    if not base.startswith(("http://", "https://")):
        raise ProviderFailure(400, "AI_INVALID_URL", "Ollama 地址必须以 http:// 或 https:// 开头")
    try:
        with httpx.Client(timeout=10.0, follow_redirects=False, trust_env=False) as client:
            response = client.get(f"{base}/api/tags")
    except httpx.TimeoutException:
        raise ProviderFailure(504, "AI_TIMEOUT", "连接 Ollama 超时")
    except httpx.HTTPError:
        raise ProviderFailure(502, "AI_NETWORK_ERROR", "无法连接 Ollama，请确认服务已启动")

    if response.status_code >= 400:
        if response.status_code in (401, 403):
            raise ProviderFailure(502, "AI_AUTH_FAILED", "Ollama 鉴权失败")
        detail = _error_detail(response)
        raise ProviderFailure(
            502,
            "AI_PROVIDER_ERROR",
            f"Ollama 返回 HTTP {response.status_code}" + (f"：{detail}" if detail else ""),
        )
    try:
        payload = response.json()
    except ValueError:
        raise ProviderFailure(502, "AI_BAD_RESPONSE", "Ollama 返回格式异常")
    raw_models = payload.get("models") if isinstance(payload, dict) else None
    if not isinstance(raw_models, list):
        raise ProviderFailure(502, "AI_BAD_RESPONSE", "Ollama 返回的模型列表格式异常")

    models: List[Dict[str, Any]] = []
    seen = set()
    for item in raw_models:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("model") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        models.append(
            {
                "name": name,
                "size": item.get("size"),
                "modified_at": item.get("modified_at"),
                "details": item.get("details") or {},
            }
        )
    return models


def _build_user_content(setting: AiSetting, source_text: str, source_type: str) -> str:
    skill = (setting.default_prompt or DEFAULT_AI_PROMPT).strip()
    if len(skill) > 20000:
        skill = skill[:20000]
    source_label = "商品链接正文" if source_type == "LINK" else "用户补充说明"
    return (
        f"<skill>\n{skill}\n</skill>\n\n"
        f"<source type=\"{source_type}\">\n{source_text}\n</source>\n\n"
        "请严格按 skill 中的 JSON Schema 输出一个 JSON 对象。"
    )


def _ollama_schema() -> Dict[str, Any]:
    item = {
        "type": "object",
        "properties": {
            "sku": {"type": "string"},
            "name": {"type": "string"},
            "spec": {"type": "string"},
            "category": {"type": "string"},
            "unit": {"type": "string"},
            "barcode": {"type": "string"},
            "quantity": {"type": "number"},
            "unit_cost": {"type": "number"},
            "reference_price": {"type": "number"},
            "confidence": {"type": "number"},
        },
        "required": [
            "name",
            "quantity",
            "unit_cost",
        ],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {
            "source_summary": {"type": "string"},
            "supplier_name": {"type": "string"},
            "order_date": {"type": ["string", "null"]},
            "related_no": {"type": "string"},
            "items": {"type": "array", "maxItems": 50, "items": item},
            "warnings": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["items"],
        "additionalProperties": False,
    }


def _model_name(setting: AiSetting) -> str:
    if setting.provider == "OLLAMA":
        return setting.ollama_model
    return setting.deepseek_model


def analyze_with_provider(
    setting: AiSetting,
    source_type: str,
    source_text: str,
    image_base64: str,
    image_mime: str,
) -> ProviderResult:
    started = time.perf_counter()
    provider = (setting.provider or "DEEPSEEK").upper()
    if provider == "OLLAMA":
        base = (setting.ollama_base_url or "http://127.0.0.1:11434").rstrip("/")
        url = f"{base}/api/chat"
        user_text = _build_user_content(setting, source_text, source_type)
        message: Dict[str, Any] = {"role": "user", "content": user_text}
        if image_base64:
            message["images"] = [image_base64]
        payload = {
            "model": setting.ollama_model or "qwen3.5:9b",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                message,
            ],
            "stream": False,
            "format": _ollama_schema(),
            "options": {"temperature": 0.1, "num_ctx": 8192},
        }
        raw = _request_json(url, payload, timeout=180.0, provider_label="Ollama")
        content = (raw.get("message") or {}).get("content") or ""
        data = _extract_json(content)
        elapsed = int((time.perf_counter() - started) * 1000)
        return ProviderResult(
            data=data,
            raw_text=content,
            provider="OLLAMA",
            model=payload["model"],
            latency_ms=elapsed,
            usage={
                "prompt_tokens": raw.get("prompt_eval_count"),
                "completion_tokens": raw.get("eval_count"),
            },
        )

    api_key = decrypt_secret(setting.deepseek_api_key_enc)
    if not api_key:
        raise ProviderFailure(400, "AI_NOT_CONFIGURED", "请先在设置中填写 DeepSeek API Key")
    base = (setting.deepseek_base_url or "https://api.deepseek.com").rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    url = f"{base}/chat/completions"
    user_text = _build_user_content(setting, source_text, source_type)
    if image_base64:
        content_parts: List[Dict[str, Any]] = [
            {"type": "text", "text": user_text},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{image_mime};base64,{image_base64}",
                    "detail": "high",
                },
            },
        ]
        user_content: Any = content_parts
    else:
        user_content = user_text
    payload = {
        "model": setting.deepseek_model or "deepseek-flash",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.1,
        "max_tokens": 4096,
        "stream": False,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    raw = _request_json(
        url, payload, headers=headers, timeout=120.0, provider_label="DeepSeek"
    )
    choices = raw.get("choices") or []
    if not choices:
        raise ProviderFailure(502, "AI_EMPTY_RESPONSE", "DeepSeek 没有返回候选结果")
    content = (choices[0].get("message") or {}).get("content") or ""
    data = _extract_json(content)
    elapsed = int((time.perf_counter() - started) * 1000)
    return ProviderResult(
        data=data,
        raw_text=content,
        provider="DEEPSEEK",
        model=payload["model"],
        latency_ms=elapsed,
        usage=raw.get("usage") or {},
    )


def test_connection(setting: AiSetting) -> Dict[str, Any]:
    started = time.perf_counter()
    provider = (setting.provider or "DEEPSEEK").upper()
    if provider == "OLLAMA":
        models = [item["name"] for item in list_ollama_models(setting.ollama_base_url)[:50]]
        target = setting.ollama_model
        available = any(
            name == target or name.split(":")[0] == target.split(":")[0] for name in models
        )
        return {
            "ok": True,
            "provider": "OLLAMA",
            "model": target,
            "model_available": available,
            "models": models[:30],
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "message": (
                f"Ollama 已连接，模型 {target} 可用"
                if available
                else (
                    f"Ollama 已连接，但未找到模型 {target}。"
                    f"可用模型：{', '.join(models[:8]) or '无'}。请从列表选择或先 ollama pull"
                )
            ),
        }

    api_key = decrypt_secret(setting.deepseek_api_key_enc)
    if not api_key:
        raise ProviderFailure(400, "AI_NOT_CONFIGURED", "请先填写 DeepSeek API Key")
    base = (setting.deepseek_base_url or "https://api.deepseek.com").rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    payload = {
        "model": setting.deepseek_model or "deepseek-flash",
        "messages": [{"role": "user", "content": "只回复 OK"}],
        "max_tokens": 8,
        "stream": False,
        "temperature": 0,
    }
    raw = _request_json(
        f"{base}/chat/completions",
        payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        timeout=30.0,
        provider_label="DeepSeek",
    )
    choices = raw.get("choices") or []
    reply = ((choices[0].get("message") or {}).get("content") or "") if choices else ""
    return {
        "ok": True,
        "provider": "DEEPSEEK",
        "model": payload["model"],
        "model_available": True,
        "reply": reply[:100],
        "latency_ms": int((time.perf_counter() - started) * 1000),
        "message": f"DeepSeek 连接成功（{payload['model']}）",
    }
