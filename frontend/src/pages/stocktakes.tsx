import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardCheck, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { useApi, useDebouncedValue, useDocumentTitle } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import type { Page, Stocktake, StocktakeStatus, StocktakeSummary, WarehouseOption } from "@/lib/types";
import { formatDate, formatQty, todayLocal } from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { SearchInput } from "@/components/common/search-input";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { BulkDeleteDialog } from "@/components/common/bulk-delete-dialog";
import { SelectionBar, TableCheckbox, useTableSelection } from "@/components/common/table-selection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, FormGrid } from "@/components/common/form";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function StocktakesPage() {
  useDocumentTitle("盘点单");
  const navigate = useNavigate();
  const { canWriteDocs } = useAuth();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 220);
  const [status, setStatus] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const warehouses = useApi<WarehouseOption[]>("/warehouses/options", { limit: 50 });
  const stocktakes = useApi<Page<StocktakeSummary>>("/stocktakes", {
    q: debouncedQ || undefined,
    status: status || undefined,
    warehouse_id: warehouseId || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    page_size: pageSize,
  });

  const items = stocktakes.data?.items ?? [];
  const selection = useTableSelection(items, (item) => String(item.id));

  const hasFilters = Boolean(q || status || warehouseId || dateFrom || dateTo);
  const clearFilters = () => {
    setQ("");
    setStatus("");
    setWarehouseId("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="盘点单"
        description="按仓库冻结账面数量，录入实盘数量，完成时自动生成盘盈盘亏流水。"
        actions={
          canWriteDocs ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              新建盘点
            </Button>
          ) : undefined
        }
      />

      <div className="app-card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="单号 / 备注" className="w-full sm:w-56" />
          <Select
            value={status || "ALL"}
            onValueChange={(value) => { setStatus(value === "ALL" ? "" : value); setPage(1); }}
            options={[
              { value: "ALL", label: "全部状态" },
              { value: "DRAFT", label: "草稿" },
              { value: "COUNTING", label: "盘点中" },
              { value: "COMPLETED", label: "已完成" },
              { value: "CANCELLED", label: "已取消" },
            ]}
            className="w-32"
          />
          <Select
            value={warehouseId || "ALL"}
            onValueChange={(value) => { setWarehouseId(value === "ALL" ? "" : value); setPage(1); }}
            options={[{ value: "ALL", label: "全部仓库" }, ...(warehouses.data ?? []).map((w) => ({ value: String(w.id), label: w.name }))]}
            className="w-40"
          />
          <div className="flex items-center gap-1.5">
            <Input type="date" value={dateFrom} max={dateTo || todayLocal()} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="w-[140px]" aria-label="开始日期" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" value={dateTo} min={dateFrom} max={todayLocal()} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="w-[140px]" aria-label="结束日期" />
          </div>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />清除
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => stocktakes.reload()} disabled={stocktakes.loading}>
            <Search className="h-3.5 w-3.5" />刷新
          </Button>
        </div>
      </div>

      {items.length > 0 ? (
        <SelectionBar
          count={selection.selectedCount}
          total={items.length}
          allSelected={selection.allSelected}
          onToggleAll={selection.toggleAll}
          onDelete={canWriteDocs ? () => setBulkDeleteOpen(true) : undefined}
          copyText={() =>
            selection.selectedRows
              .map((item) => `${item.stocktake_no}\t${item.warehouse_name}\t${item.status}\t${item.total_difference_quantity}`)
              .join("\n")
          }
        />
      ) : null}

      <div className="app-card overflow-hidden">
        {stocktakes.loading ? (
          <TableSkeleton columns={7} />
        ) : stocktakes.error ? (
          <ErrorState message={stocktakes.error} onRetry={stocktakes.reload} />
        ) : !stocktakes.data || stocktakes.data.items.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={hasFilters ? "没有符合条件的盘点单" : "还没有盘点单"}
            description={hasFilters ? "尝试清除筛选条件。" : "创建盘点单后，系统会冻结该仓库全部商品的账面数量。"}
            actionLabel={canWriteDocs && !hasFilters ? "新建盘点" : undefined}
            onAction={canWriteDocs && !hasFilters ? () => setCreateOpen(true) : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="border-b border-black/[0.06] bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-4 py-2.5 font-medium">
                      <TableCheckbox
                        checked={selection.allSelected}
                        indeterminate={selection.someSelected}
                        onChange={selection.toggleAll}
                        label="全选当前页盘点单"
                      />
                    </th>
                    <th className="px-4 py-2.5 font-medium">盘点单号</th>
                    <th className="px-3 py-2.5 font-medium">仓库</th>
                    <th className="px-3 py-2.5 font-medium">状态</th>
                    <th className="px-3 py-2.5 text-right font-medium">盘点行</th>
                    <th className="px-3 py-2.5 text-right font-medium">差异行</th>
                    <th className="px-3 py-2.5 text-right font-medium">差异数量</th>
                    <th className="px-3 py-2.5 font-medium">创建人</th>
                    <th className="px-3 py-2.5 font-medium">创建时间</th>
                    <th className="px-4 py-2.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {stocktakes.data.items.map((item) => (
                    <tr key={item.id} className="group transition-colors hover:bg-secondary/30">
                      <td className="w-10 px-4 py-3 pr-0">
                        <TableCheckbox
                          checked={selection.selected.has(String(item.id))}
                          onChange={(checked) => selection.toggle(String(item.id), checked)}
                          label={`选择 ${item.stocktake_no}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/stocktakes/${item.id}`} className="font-mono text-[11px] font-medium text-primary hover:underline">
                          {item.stocktake_no}
                        </Link>
                      </td>
                      <td className="px-3 py-3">{item.warehouse_name}</td>
                      <td className="px-3 py-3"><StatusBadge status={item.status as StocktakeStatus} /></td>
                      <td className="px-3 py-3 text-right tabular">{item.line_count}</td>
                      <td className="px-3 py-3 text-right tabular">
                        <span className={item.difference_line_count > 0 ? "font-semibold text-amber-700" : ""}>{item.difference_line_count}</span>
                      </td>
                      <td className={`px-3 py-3 text-right font-medium tabular ${item.total_difference_quantity > 0 ? "text-emerald-700" : item.total_difference_quantity < 0 ? "text-rose-700" : "text-muted-foreground"}`}>
                        {item.total_difference_quantity > 0 ? "+" : ""}{formatQty(item.total_difference_quantity)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{item.created_by_name}</td>
                      <td className="px-3 py-3 text-[11px] text-muted-foreground">{formatDate(item.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/stocktakes/${item.id}`}>{item.status === "COMPLETED" || item.status === "CANCELLED" ? "查看" : "继续盘点"}</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={stocktakes.data.page}
              pageSize={stocktakes.data.page_size}
              total={stocktakes.data.total}
              pages={stocktakes.data.pages}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          </>
        )}
      </div>

      <CreateStocktakeDialog open={createOpen} onOpenChange={setCreateOpen} warehouses={warehouses.data ?? []} onCreated={(stocktake) => navigate(`/stocktakes/${stocktake.id}`)} />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        rows={selection.selectedRows}
        entityLabel="盘点单"
        getPath={(stocktake) => `/stocktakes/${stocktake.id}`}
        getLabel={(stocktake) => stocktake.stocktake_no}
        description="只有草稿状态的盘点单可以删除。已完成或已取消的盘点单会保留，并说明原因。"
        onDone={() => {
          stocktakes.reload();
          selection.clear();
        }}
      />
    </div>
  );
}

function CreateStocktakeDialog({
  open,
  onOpenChange,
  warehouses,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouses: WarehouseOption[];
  onCreated: (stocktake: Stocktake) => void;
}) {
  const [warehouseId, setWarehouseId] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setWarehouseId("");
    setRemark("");
    setError("");
  };

  const submit = async () => {
    if (!warehouseId) {
      setError("请选择要盘点的仓库");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await api.post<Stocktake>("/stocktakes", {
        warehouse_id: Number(warehouseId),
        remark: remark.trim(),
      });
      toast.success("盘点单已创建，请录入实盘数量");
      onOpenChange(false);
      reset();
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "创建失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) {
          onOpenChange(next);
          if (!next) reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建盘点单</DialogTitle>
          <p className="text-[12px] leading-5 text-muted-foreground">
            系统会冻结所选仓库全部启用商品的账面数量。同一仓库同时只能有一张进行中的盘点单。
          </p>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FormField label="盘点仓库" required>
            <Select
              value={warehouseId}
              onValueChange={setWarehouseId}
              placeholder="选择仓库"
              options={warehouses.map((warehouse) => ({ value: String(warehouse.id), label: `${warehouse.name} (${warehouse.code})` }))}
            />
          </FormField>
          <FormField label="盘点说明" hint="例如：月末全盘、循环盘点 A 区">
            <Input value={remark} onChange={(event) => setRemark(event.target.value)} maxLength={240} placeholder="可选" />
          </FormField>
          {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={() => void submit()} disabled={saving} loading={saving}>创建盘点单</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
