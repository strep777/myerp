import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, type QueryParams } from "@/lib/api";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (data: T | null) => void;
}

export function useApi<T>(
  path: string | null,
  params?: QueryParams,
  options?: { enabled?: boolean },
): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path) && options?.enabled !== false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const paramsKey = JSON.stringify(params || {});
  const enabled = options?.enabled !== false && Boolean(path);

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get<T>(path, JSON.parse(paramsKey) as QueryParams, controller.signal)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "加载失败，请稍后重试");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, paramsKey, version, enabled]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { data, loading, error, reload, setData };
}

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Lager 仓储` : "Lager 仓储";
  }, [title]);
}

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

export function useMountedRef() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
