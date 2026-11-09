import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ListChecks, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function TableCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      <input
        type="checkbox"
        checked={checked}
        ref={(node) => {
          if (node) node.indeterminate = indeterminate && !checked;
        }}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
        className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-[#007AFF]"
      />
    </span>
  );
}

export function useTableSelection<T>(rows: T[], getKey: (row: T) => string) {
  const keys = useMemo(() => rows.map(getKey), [rows, getKey]);
  const signature = keys.join("\u0001");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [signature]);

  const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
  const someSelected = !allSelected && keys.some((key) => selected.has(key));
  const selectedRows = rows.filter((row) => selected.has(getKey(row)));

  const toggle = (key: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(keys));
  };

  return {
    selected,
    selectedRows,
    selectedCount: selectedRows.length,
    allSelected,
    someSelected,
    toggle,
    toggleAll,
    clear: () => setSelected(new Set()),
  };
}

export function SelectionBar({
  count,
  total,
  allSelected,
  onToggleAll,
  onDelete,
  copyText,
  copyLabel = "复制选中",
}: {
  count: number;
  total: number;
  allSelected: boolean;
  onToggleAll: () => void;
  /** 传入后在工具栏显示“清除数据”；只读列表不要传。 */
  onDelete?: () => void;
  copyText?: () => string;
  copyLabel?: string;
}) {
  const copy = async () => {
    if (!copyText) return;
    const text = copyText();
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制 ${count} 项到剪贴板`);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      toast.success(`已复制 ${count} 项到剪贴板`);
    }
  };

  if (count === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-black/[0.055] bg-white/70 px-3 py-1.5">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5" />
        本页已选 <strong className="text-foreground">{count}</strong> / {total} 项
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={onToggleAll}>
          {allSelected ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          {allSelected ? "取消全选" : "全选本页"}
        </Button>
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
            清除数据
          </Button>
        ) : null}
        {copyText ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => void copy()}>
            <Copy className="h-3 w-3" />
            {copyLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
