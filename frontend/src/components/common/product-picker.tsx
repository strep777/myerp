import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Package, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApi, useDebouncedValue } from "@/hooks/use-api";
import type { ProductOption } from "@/lib/types";

interface ProductPickerProps {
  selected: ProductOption | null;
  onChange: (product: ProductOption) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}

export function ProductPicker({
  selected,
  onChange,
  disabled,
  placeholder = "搜索商品名称或 SKU",
  className,
  invalid,
}: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 220);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, loading } = useApi<ProductOption[]>(
    "/products/options",
    { q: debouncedQuery || undefined, limit: 50 },
    { enabled: open },
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const options = data ?? [];

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-3 text-left text-sm shadow-[0_1px_1px_rgba(15,23,42,0.02)] transition-colors focus:border-primary/60 focus:outline-none focus:ring-[3px] focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-secondary/60 disabled:opacity-70",
          invalid && "border-destructive/60 focus:border-destructive focus:ring-destructive/15",
        )}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {selected.sku}
            </span>
            <span className="truncate text-[13px]">{selected.name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{selected.unit}</span>
          </span>
        ) : (
          <span className="truncate text-[13px] text-muted-foreground/70">{placeholder}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/70" />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-black/[0.08] bg-popover shadow-popover animate-scale-in">
          <div className="relative border-b border-black/[0.06] p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入名称、SKU 或条码搜索"
              className="h-8 w-full rounded-md border border-input bg-white pl-8 pr-2 text-[12px] outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto p-1" role="listbox">
            {loading ? (
              <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">正在搜索…</p>
            ) : options.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
                <Package className="h-5 w-5 text-muted-foreground/50" />
                <p className="text-[12px] text-muted-foreground">没有找到商品</p>
                <p className="text-[10px] text-muted-foreground/70">先到「商品」中创建并启用商品</p>
              </div>
            ) : (
              options.map((product) => {
                const active = selected?.id === product.id;
                return (
                  <button
                    key={product.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(product);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent",
                      active && "bg-primary/[0.06]",
                    )}
                  >
                    <span className="w-4 shrink-0">
                      {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-medium">{product.name}</span>
                        {product.spec ? (
                          <span className="truncate text-[10px] text-muted-foreground">{product.spec}</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="font-mono uppercase">{product.sku}</span>
                        <span>·</span>
                        <span>{product.unit}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="border-t border-black/[0.06] px-3 py-1.5 text-[10px] text-muted-foreground/70">
            最多显示 50 个结果，输入关键词可缩小范围
          </p>
        </div>
      ) : null}
    </div>
  );
}
