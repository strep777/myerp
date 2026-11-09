"""Check that FastAPI serves the built SPA and its assets."""
import re
import sys
import urllib.request


BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8011"


def get(path: str):
    with urllib.request.urlopen(BASE + path, timeout=10) as response:
        return response.status, response.headers, response.read()


status, headers, body = get("/")
html = body.decode("utf-8")
assets = re.findall(r'(?:src|href)="(/assets/[^"]+)"', html)
print("index", status, headers.get_content_type(), "bytes", len(body))
print("assets", assets)
for asset in assets:
    asset_status, asset_headers, asset_body = get(asset)
    print(asset, asset_status, asset_headers.get_content_type(), len(asset_body))
for route in ("/products", "/inbound-orders/new", "/system/info"):
    route_status, route_headers, route_body = get(route)
    print("route", route, route_status, route_headers.get_content_type(), len(route_body))
