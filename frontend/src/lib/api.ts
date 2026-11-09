import type { ApiErrorBody } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;
  requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.detail || "请求失败");
    this.name = "ApiError";
    this.status = status;
    this.code = body.code || "UNKNOWN";
    this.fields = body.fields || {};
    this.requestId = body.request_id;
  }
}

type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  params?: QueryParams;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, params, signal, timeoutMs = form ? 120000 : 20000 } = options;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch(`${API_BASE}${path}${buildQuery(params)}`, {
      method,
      credentials: "include",
      headers: form || body === undefined ? undefined : { "Content-Type": "application/json" },
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal: controller.signal,
    });

    if (response.status === 401 && !path.startsWith("/auth/login")) {
      window.dispatchEvent(new Event("lager:unauthorized"));
    }

    if (!response.ok) {
      let errorBody: ApiErrorBody = {
        detail: response.statusText || "请求失败",
        code: "HTTP_ERROR",
      };
      try {
        errorBody = (await response.json()) as ApiErrorBody;
      } catch {
        // Non-JSON response (proxy error etc.)
      }
      throw new ApiError(response.status, errorBody);
    }

    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return (await response.text()) as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted) throw error;
      throw new ApiError(0, { detail: "请求超时，请检查网络后重试", code: "TIMEOUT" });
    }
    if (error instanceof TypeError) {
      throw new ApiError(0, { detail: "无法连接服务器，请确认服务已启动", code: "NETWORK_ERROR" });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export const api = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) =>
    apiRequest<T>(path, { params, signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  postForm: <T>(path: string, form: FormData) =>
    apiRequest<T>(path, { method: "POST", form, timeoutMs: 120000 }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  delete: <T = void>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return fallback;
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] || fallback;
}

export async function downloadCsv(path: string, params: QueryParams | undefined, fallback: string) {
  const response = await fetch(`${API_BASE}${path}${buildQuery(params)}`, {
    credentials: "include",
  });
  if (!response.ok) {
    let body: ApiErrorBody = { detail: "导出失败", code: "EXPORT_ERROR" };
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // ignore
    }
    if (response.status === 401) window.dispatchEvent(new Event("lager:unauthorized"));
    throw new ApiError(response.status, body);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filenameFromDisposition(
    response.headers.get("content-disposition"),
    fallback,
  );
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
