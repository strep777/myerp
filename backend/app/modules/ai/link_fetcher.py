from __future__ import annotations

import base64
import html
import ipaddress
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Dict, List, Optional

from app.core.errors import AppError


MAX_LINK_BYTES = 1_500_000
MAX_TEXT_CHARS = 12_000
MAX_IMAGE_BYTES = 5 * 1024 * 1024
USER_AGENT = "LagerBot/1.1 (+local warehouse assistant; single-page fetch)"


def _is_public_ip(raw: str) -> bool:
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_public_url(url: str) -> str:
    value = (url or "").strip()
    if not value:
        raise AppError(400, "AI_INVALID_URL", "请输入商品链接")
    if len(value) > 2000:
        raise AppError(400, "AI_INVALID_URL", "链接不能超过 2000 个字符")
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in ("http", "https"):
        raise AppError(400, "AI_INVALID_URL", "只支持 http 或 https 链接")
    if not parsed.hostname:
        raise AppError(400, "AI_INVALID_URL", "链接缺少主机名")
    if parsed.username or parsed.password:
        raise AppError(400, "AI_INVALID_URL", "链接不能包含用户名或密码")
    host = parsed.hostname
    if host.lower() in ("localhost", "localhost.localdomain"):
        raise AppError(400, "AI_PRIVATE_URL", "不能抓取本机或内网地址")
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror:
        raise AppError(400, "AI_URL_UNREACHABLE", "无法解析链接域名")
    if not infos:
        raise AppError(400, "AI_URL_UNREACHABLE", "无法解析链接域名")
    addresses = {info[4][0] for info in infos}
    if any(not _is_public_ip(address) for address in addresses):
        raise AppError(400, "AI_PRIVATE_URL", "不能抓取本机或内网地址")
    return value


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    max_redirections = 3

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: List[str] = []
        self.meta: Dict[str, str] = {}
        self.text_parts: List[str] = []
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag in ("script", "style", "noscript", "svg", "template"):
            self._skip_depth += 1
            return
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            values = {str(k).lower(): (v or "") for k, v in attrs}
            key = (values.get("property") or values.get("name") or "").lower()
            if key in ("og:title", "og:description", "description", "title"):
                content = values.get("content", "").strip()
                if content:
                    self.meta[key] = content

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in ("script", "style", "noscript", "svg", "template"):
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._skip_depth or not data:
            return
        if self._in_title:
            self.title_parts.append(data)
        else:
            self.text_parts.append(data)

    def result(self) -> Dict[str, str]:
        title = " ".join(self.title_parts).strip() or self.meta.get("og:title", "")
        description = self.meta.get("og:description") or self.meta.get("description", "")
        text = "\n".join(self.text_parts)
        return {
            "title": _clean(title)[:300],
            "description": _clean(description)[:500],
            "text": _clean(text)[:MAX_TEXT_CHARS],
        }


def _clean(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"[ \t\r\f\v]+", " ", value)
    lines = []
    seen = set()
    for line in value.split("\n"):
        line = line.strip()
        if not line or line in seen:
            continue
        seen.add(line)
        lines.append(line)
        if len("\n".join(lines)) >= MAX_TEXT_CHARS:
            break
    return "\n".join(lines)[:MAX_TEXT_CHARS]


def _read_limited(response, limit: int) -> bytes:
    length = response.headers.get("Content-Length")
    if length:
        try:
            if int(length) > limit:
                raise AppError(400, "AI_SOURCE_TOO_LARGE", "来源内容过大，无法分析")
        except ValueError:
            pass
    data = response.read(limit + 1)
    if len(data) > limit:
        raise AppError(400, "AI_SOURCE_TOO_LARGE", "来源内容过大，无法分析")
    return data


def fetch_link(url: str) -> Dict[str, str]:
    target = validate_public_url(url)
    opener = urllib.request.build_opener(_SafeRedirectHandler())
    request = urllib.request.Request(
        target,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,text/plain,image/*;q=0.8,*/*;q=0.5",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
        },
    )
    try:
        with opener.open(request, timeout=8) as response:
            content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if content_type.startswith("image/"):
                data = _read_limited(response, MAX_IMAGE_BYTES)
                mime = content_type if content_type in (
                    "image/jpeg",
                    "image/png",
                    "image/webp",
                    "image/gif",
                ) else "image/jpeg"
                return {
                    "kind": "image",
                    "mime": mime,
                    "image_base64": base64.b64encode(data).decode("ascii"),
                    "title": urllib.parse.urlsplit(target).hostname or "商品图片",
                    "text": "",
                    "description": "",
                    "url": target,
                }
            if not (
                content_type.startswith("text/html")
                or content_type.startswith("text/plain")
                or content_type.startswith("application/xhtml")
                or content_type == ""
            ):
                raise AppError(400, "AI_UNSUPPORTED_LINK", "该链接不是网页或图片，无法分析")
            data = _read_limited(response, MAX_LINK_BYTES)
            charset = response.headers.get_content_charset() or "utf-8"
            try:
                decoded = data.decode(charset, errors="replace")
            except LookupError:
                decoded = data.decode("utf-8", errors="replace")
    except AppError:
        raise
    except urllib.error.HTTPError as exc:
        raise AppError(400, "AI_LINK_FETCH_FAILED", f"链接返回 HTTP {exc.code}，无法读取")
    except (urllib.error.URLError, TimeoutError, socket.timeout):
        raise AppError(400, "AI_LINK_FETCH_FAILED", "链接访问失败或超时，请检查地址是否公开可访问")

    parser = _TextExtractor()
    try:
        parser.feed(decoded)
        parsed = parser.result()
    except Exception:
        parsed = {"title": "", "description": "", "text": _clean(decoded)[:MAX_TEXT_CHARS]}
    text = parsed["text"]
    if parsed["description"] and parsed["description"] not in text:
        text = f"{parsed['description']}\n{text}"
    if len(text.strip()) < 20:
        raise AppError(
            400,
            "AI_LINK_EMPTY",
            "链接没有可读正文，可能需要登录或由 JavaScript 渲染；请改用截图",
        )
    return {
        "kind": "text",
        "mime": "",
        "image_base64": "",
        "title": parsed["title"] or urllib.parse.urlsplit(target).hostname or "",
        "text": text[:MAX_TEXT_CHARS],
        "description": parsed["description"],
        "url": target,
    }
