import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, ClipboardCheck, Filter, Save, Search, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { useApi, useDocumentTitle } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Stocktake } from "@/lib/types";
import { formatDate, formatDateTime, formatQty } from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { SearchInput } from "@/components/common/search-input";
import { ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CountDraft = Record<number, { counted: string; remark: string }>;
type Action = "complete" | "cancel" | "delete" | null;

export function StocktakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canWriteDocs } = useAuth();
  const stocktake = useApi<Stocktake>(id ? `/stocktakes/${id}` : null);
  const [draft, setDraft] = useState<CountDraft>({});
  const [search, setSearch] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [invalid, setInvalid] = useState<Record<number, string>>({});
  useDocumentTitle(stocktake.data ? `${stocktake.data.stocktake_no} · 盘点` : "盘点");

  useEffect(() => {
    if (!stocktake.data) return;
    const next: CountDraft = {};
    for (const line of stocktake.data.lines) {
      next[line.id] = { counted: String(line.counted_quantity), remark: line.remark ?? "" };
    }
    setDraft(next);
    setInvalid({});
  }, [stocktake.data]);

  const data = stocktake.data;
  const editable = Boolean(data && (data.status === "DRAFT" || data.status === "COUNTING") && canWriteDocs);
  const dirty = useMemo(() => {
    if (!data) return false;
    return data.lines.some((line) => {
      const value = draft[line.id];
      if (!value) return false;
      return Number(value.counted) !== Number(line.counted_quantity) || value.remark !== (line.remark ?? "");
    });
  }, [data, draft]);

  const counts = useMemo(() => {
    if (!data) return { diffLines: 0, totalDiff: 0 };
    let diffLines = 0;
    let totalDiff = 0;
    for (const line of data.lines) {
      const value = draft[line.id]?.counted;
      const counted = value === "" || value === undefined ? line.book_quantity : Number(value);
      const diff = counted - line.book_quantity;
      if (Math.abs(diff) > 0.00005) diffLines += 1;
      totalDiff += diff;
    }
    return { diffLines, totalDiff };
  }, [data, draft]);

  const visibleLines = useMemo(() => {
    if (!data) return [];
    const keyword = search.trim().toLowerCase();
    return data.lines.filter((line) => {
      if (keyword) {
        const haystack = `${line.sku} ${line.product_name}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      if (onlyDiff) {
        const value = draft[line.id]?.counted;
        const counted = value === "" || value === undefined ? line.book_quantity : Number(value);
        if (Math.abs(counted - line.book_quantity) < 0.00005) return false;
      }
      return true;
    });
  }, [data, draft, onlyDiff, search]);

  const updateLine = (lineId: number, key: "counted" | "remark", value: string) => {
    setDraft((current) => ({
      ...current,
      [lineId]: { ...(current[lineId] ?? { counted: "", remark: "" }), [key]: value },
    }));
    if (key === "counted") {
      setInvalid((current) => {
        if (!current[lineId]) return current;
        const next = { ...current };
        delete next[lineId];
        return next;
      });
    }
  };

  const buildPayload = () => {
    if (!data) return { errors: {} as Record<number, string>, payload: { lines: [] } };
    const errors: Record<number, string> = {};
    const lines = data.lines.map((line) => {
      const value = draft[line.id]?.counted ?? "";
      const counted = value === "" ? line.book_quantity : Number(value);
      if (!Number.isFinite(counted) || counted < 0) errors[line.id] = "实盘数量不能为负数";
      return {
        line_id: line.id,
        counted_quantity: counted,
        remark: (draft[line.id]?.remark ?? "").trim(),
      };
    });
    return { errors, payload: { lines } };
  };

  const save = async (silent = false) => {
    if (!data) return false;
    const built = buildPayload();
    if (built.errors && Object.keys(built.errors).length > 0) {
      setInvalid(built.errors);
      toast.error("请修正标红的实盘数量");
      return false;
    }
    setSaving(true);
    try {
      await api.put<Stocktake>(`/stocktakes/${data.id}/lines`, built.payload);
      if (!silent) toast.success("实盘数量已保存");
      stocktake.reload();
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "保存失败，请稍后重试");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const runAction = async () => {
    if (!data || !action) return;
    try {
      if (action === "delete") {
        await api.delete(`/stocktakes/${data.id}`);
        toast.success("盘点单已删除");
        navigate("/stocktakes");
        return;
      }
      await api.post<Stocktake>(`/stocktakes/${data.id}/${action}`);
      toast.success(action === "complete" ? "盘点已完成，差异已写入库存流水" : "盘点单已取消");
      setAction(null);
      stocktake.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "操作失败，请稍后重试";
      toast.error(message);
      if (err instanceof ApiError && err.code === "STOCKTAKE_STALE") {
        stocktake.reload();
      }
    }
  };

  if (stocktake.loading) {
    return (
      <div>
        <PageHeader title="盘点单" back="/stocktakes" />
        <TableSkeleton columns={5} />
      </div>
    );
  }

  if (stocktake.error || !data) {
    return (
      <div>
        <PageHeader title="盘点单" back="/stocktakes" />
        <div className="app-card"><ErrorState message={stocktake.error || "未找到该盘点单"} onRetry={stocktake.reload} /></div>
      </div>
    );
  }

  const active = data.status === "DRAFT" || data.status === "COUNTING";

  return (
    <div>
      <PageHeader
        title={data.stocktake_no}
        eyebrow="库存盘点"
        description={`${data.warehouse_name} · 创建于 ${formatDateTime(data.created_at)}${data.created_by_name ? ` · ${data.created_by_name}` : ""}`}
        back="/stocktakes"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            {editable ? (
              <Button variant="secondary" onClick={() => void save()} loading={saving} disabled={!dirty || saving}>
                <Save className="h-4 w-4" />
                保存实盘
              </Button>
            ) : null}
            {editable ? (
              <Button onClick={() => setAction("complete")} disabled={dirty || saving}>
                <Check className="h-4 w-4" />
                完成盘点
              </Button>
            ) : null}
          </div>
        }
      />

      {data.status === "COMPLETED" ? (
        <div className="mb-4 rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-[12px] text-emerald-800">
          <p className="flex items-center gap-2 font-medium"><ClipboardCheck className="h-4 w-4" />盘点已完成</p>
          <p className="mt-1 text-emerald-700">差异已写入库存流水并更新余额。完成人 {data.completed_by_name || "—"}，完成时间 {data.completed_at ? formatDateTime(data.completed_at) : "—"}。</p>
        </div>
      ) : data.status === "CANCELLED" ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-600">
          该盘点单已取消，没有对库存产生影响。
        </div>
      ) : (
        <div className={cn("mb-4 rounded-xl border px-4 py-3 text-[12px]", dirty ? "border-amber-200/80 bg-amber-50/70 text-amber-800" : "border-blue-200/70 bg-blue-50/70 text-blue-800")}>
          {dirty
            ? "实盘数量有未保存的修改。请先保存，保存后仍可继续修改；全部核对完成后再执行「完成盘点」。"
            : "逐行录入实盘数量。留空的项按账面数量计算；保存不会影响库存，完成盘点才会按差异生成流水。"}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="盘点行数" value={String(data.line_count)} />
        <Stat label="差异行数" value={String(counts.diffLines)} tone={counts.diffLines ? "warn" : "default"} />
        <Stat label="差异合计" value={`${counts.totalDiff > 0 ? "+" : ""}${formatQty(counts.totalDiff)}`} tone={counts.totalDiff > 0 ? "gain" : counts.totalDiff < 0 ? "loss" : "default"} />
        <Stat label="仓库" value={data.warehouse_name} />
      </div>

      <div className="app-card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="搜索 SKU / 商品名称" className="w-full sm:w-64" />
          <Button variant={onlyDiff ? "default" : "secondary"} size="sm" onClick={() => setOnlyDiff((value) => !value)}>
            <Filter className="h-3.5 w-3.5" />
            仅看差异
          </Button>
          <span className="text-[11px] text-muted-foreground">显示 {visibleLines.length} / {data.lines.length} 行</span>
          <div className="ml-auto flex gap-2">
            {active && canWriteDocs ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setAction("cancel")}>
                  <XCircle className="h-3.5 w-3.5" />取消盘点
                </Button>
                {data.status === "DRAFT" ? (
                  <Button variant="ghost" size="sm" onClick={() => setAction("delete")}>
                    <Trash2 className="h-3.5 w-3.5" />删除
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[12px]">
            <thead className="border-b border-black/[0.06] bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">商品</th>
                <th className="px-3 py-2.5 text-right font-medium">账面数量</th>
                <th className="px-3 py-2.5 text-right font-medium">实盘数量</th>
                <th className="px-3 py-2.5 text-right font-medium">差异</th>
                <th className="px-4 py-2.5 font-medium">行备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {visibleLines.map((line) => {
                const current = draft[line.id] ?? { counted: String(line.counted_quantity), remark: line.remark ?? "" };
                const counted = current.counted === "" ? line.book_quantity : Number(current.counted);
                const diff = counted - line.book_quantity;
                return (
                  <tr key={line.id} className={cn(invalid[line.id] && "bg-destructive/5")}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{line.product_name}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase text-muted-foreground">{line.sku} · {line.unit}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular text-muted-foreground">{formatQty(line.book_quantity)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {editable ? (
                        <div>
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.0001"
                            min="0"
                            value={current.counted}
                            onChange={(event) => updateLine(line.id, "counted", event.target.value)}
                            className={cn("ml-auto h-8 w-28 text-right tabular", invalid[line.id] && "border-destructive")}
                            aria-label={`${line.product_name} 实盘数量`}
                          />
                          {invalid[line.id] ? <p className="mt-1 text-[10px] text-destructive">{invalid[line.id]}</p> : null}
                        </div>
                      ) : (
                        <span className="font-semibold tabular">{formatQty(line.counted_quantity)}</span>
                      )}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right font-semibold tabular", diff > 0 ? "text-emerald-700" : diff < 0 ? "text-rose-700" : "text-muted-foreground")}>
                      {diff === 0 ? "0" : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}
                    </td>
                    <td className="px-4 py-2.5">
                      {editable ? (
                        <Input value={current.remark} onChange={(event) => updateLine(line.id, "remark", event.target.value)} placeholder="差异原因" maxLength={160} className="h-8 min-w-[160px]" />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">{line.remark || "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleLines.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
            <Search className="mx-auto mb-2 h-5 w-5 opacity-40" />
            {onlyDiff ? "当前没有差异行" : "没有匹配的商品"}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/stocktakes"><ArrowLeft className="h-3.5 w-3.5" />返回盘点列表</Link>
        </Button>
        <p className="text-[10px] text-muted-foreground">
          {data.status === "COMPLETED" ? `完成于 ${data.completed_at ? formatDate(data.completed_at) : "—"}` : "完成盘点前请确认所有实盘数量已保存"}
        </p>
      </div>

      <ConfirmDialog
        open={action === "complete"}
        onOpenChange={(next) => !next && setAction(null)}
        title="完成盘点并调整库存"
        description="系统会再次核对账面数量；如果盘点期间库存发生变化，完成操作会被拒绝，需要重新盘点。确认后将按差异写入盘盈/盘亏流水。"
        confirmLabel="完成盘点"
        onConfirm={runAction}
      >
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg bg-secondary/60 px-3 py-2"><span className="text-muted-foreground">差异行</span><p className="mt-1 text-lg font-semibold">{counts.diffLines}</p></div>
          <div className="rounded-lg bg-secondary/60 px-3 py-2"><span className="text-muted-foreground">差异合计</span><p className={cn("mt-1 text-lg font-semibold tabular", counts.totalDiff > 0 ? "text-emerald-700" : counts.totalDiff < 0 ? "text-rose-700" : "")}>{counts.totalDiff > 0 ? "+" : ""}{formatQty(counts.totalDiff)}</p></div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={action === "cancel"}
        onOpenChange={(next) => !next && setAction(null)}
        title="取消盘点单"
        description="取消后不会调整库存，盘点单会保留用于追溯。"
        confirmLabel="确认取消"
        destructive
        onConfirm={runAction}
      />
      <ConfirmDialog
        open={action === "delete"}
        onOpenChange={(next) => !next && setAction(null)}
        title="删除盘点草稿"
        description="仅草稿可以删除，删除后无法恢复。"
        confirmLabel="删除"
        destructive
        onConfirm={runAction}
      />
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "gain" | "loss" }) {
  return (
    <div className="app-card p-4">
      <p className="field-label">{label}</p>
      <p className={cn("mt-1.5 truncate text-[18px] font-semibold tracking-[-0.02em] tabular", tone === "warn" && "text-amber-700", tone === "gain" && "text-emerald-700", tone === "loss" && "text-rose-700")}>{value}</p>
    </div>
  );
}
