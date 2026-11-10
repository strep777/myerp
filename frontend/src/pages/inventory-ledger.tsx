import { useEffect, useState } from "react";
import { Download, FilterX } from "lucide-react";
import { toast } from "sonner";
import { ApiError, downloadCsv } from "@/lib/api";
import { useApi, useDocumentTitle } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import {
  MOVEMENT_LABELS,
  MOVEMENT_OPTIONS,
  formatDateTime,
  formatMoney,
  formatQty,
  formatSignedQty,
  movementLabel,
} from "@/lib/format";
import type { LedgerEntry, Page, ProductOption, WarehouseOption } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { ProductPicker } from "@/components/common/product-picker";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { SelectionBar, TableCheckbox, useTableSelection } from "@/components/common/table-selection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const MOVEMENT_TONES: Record<string, string> = {
  INBOUND: "default",
  TRANSFER_IN: "default",
  OUTBOUND: "secondary",
  TRANSFER_OUT: "secondary",
  ADJUSTMENT: "warning",
  STOCKTAKE_GAIN: "success",
  STOCKTAKE_LOSS: "danger",
};

export function InventoryLedgerPage() {
  useDocumentTitle("库存流水");
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [warehouseId, setWarehouseId] = useState("all");
  const [movementType, setMovementType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refNo, setRefNo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState(false);

  const warehouses = useApi<WarehouseOption[]>("/warehouses/options");
  const params = {
    product_id: product?.id,
    warehouse_id: warehouseId === "all" ? undefined : warehouseId,
    movement_type: movementType === "all" ? undefined : movementType,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ref_no: refNo.trim() || undefined,
    page,
    page_size: pageSize,
  };
  const ledger = useApi<Page<LedgerEntry>>("/inventory/ledger", params);

  useEffect(() => setPage(1), [product?.id, warehouseId, movementType, dateFrom, dateTo, refNo, pageSize]);

  const resetFilters = () => {
    setProduct(null);
    setWarehouseId("all");
    setMovementType("all");
    setDateFrom("");
    setDateTo("");
    setRefNo("");
    setPage(1);
  };

  const hasFilters =
    Boolean(product) ||
    warehouseId !== "all" ||
    movementType !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(refNo);

  const exportLedger = async () => {
    setExporting(true);
    try {
      await downloadCsv(
        "/reports/export/ledger.csv",
        {
          product_id: product?.id,
          warehouse_id: warehouseId === "all" ? undefined : warehouseId,
          movement_type: movementType === "all" ? undefined : movementType,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          ref_no: refNo.trim() || undefined,
        },
        "ledger.csv",
      );
      toast.success("库存流水已导出");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const warehouseOptions = [
    { value: "all", label: "全部仓库" },
    ...(warehouses.data ?? []).map((warehouse) => ({
      value: String(warehouse.id),
      label: warehouse.name,
    })),
  ];

  const items = ledger.data?.items ?? [];
  const selection = useTableSelection(items, (item) => String(item.id));

  return (
    <div>
      <PageHeader
        title="库存流水"
        description="每一次库存变动都有迹可循：入库、出库、调拨、盘点与调整都会生成唯一流水。"
        back="/inventory"
        actions={
          <Button variant="secondary" onClick={() => void exportLedger()} loading={exporting}>
            <Download className="h-4 w-4" />
            导出 CSV
          </Button>
        }
      />

      <div className="app-card mb-4 p-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="field-label">商品</p>
            <ProductPicker selected={product} onChange={setProduct} placeholder="全部商品" />
          </div>
          <div>
            <p className="field-label">仓库</p>
            <Select value={warehouseId} onValueChange={setWarehouseId} options={warehouseOptions} />
          </div>
          <div>
            <p className="field-label">变动类型</p>
            <Select
              value={movementType}
              onValueChange={setMovementType}
              options={[{ value: "all", label: "全部类型" }, ...MOVEMENT_OPTIONS]}
            />
          </div>
          <div>
            <p className="field-label">关联单号</p>
            <Input
              value={refNo}
              onChange={(event) => setRefNo(event.target.value)}
              placeholder="例如 IN-20250101-0001"
              className="h-9"
            />
          </div>
          <div>
            <p className="field-label">开始日期</p>
            <Input
              type="date"
              aria-label="开始日期"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <p className="field-label">结束日期</p>
            <Input
              type="date"
              aria-label="结束日期"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              disabled={!hasFilters}
              className="h-9"
            >
              <FilterX className="h-3.5 w-3.5" />
              清除筛选
            </Button>
          </div>
          <div className="flex items-end justify-start lg:justify-end">
            <p className="pb-2 text-[11px] text-muted-foreground">
              {ledger.data ? `共 ${ledger.data.total} 条流水` : "正在加载…"}
            </p>
          </div>
        </div>
      </div>

      {ledger.loading ? (
        <TableSkeleton columns={8} />
      ) : ledger.error ? (
        <div className="app-card">
          <ErrorState message={ledger.error} onRetry={ledger.reload} />
        </div>
      ) : items.length === 0 ? (
        <div className="app-card">
          <EmptyState
            icon={Download}
            title={hasFilters ? "没有匹配的流水" : "暂无库存流水"}
            description={
              hasFilters
                ? "试试调整商品、仓库、类型或日期范围。"
                : "当入库单、出库单、调拨单或盘点完成后，流水会显示在这里。"
            }
          />
        </div>
      ) : (
        <>
          <SelectionBar
            count={selection.selectedCount}
            total={items.length}
            allSelected={selection.allSelected}
            onToggleAll={selection.toggleAll}
            copyText={() =>
              selection.selectedRows
                .map((item) => `${formatDateTime(item.created_at)}\t${item.ref_no}\t${item.sku}\t${item.product_name}\t${formatSignedQty(item.change_qty)}`)
                .join("\n")
            }
          />
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th className="w-10">
                    <TableCheckbox
                      checked={selection.allSelected}
                      indeterminate={selection.someSelected}
                      onChange={selection.toggleAll}
                      label="全选当前页流水"
                    />
                  </th>
                  <th>时间</th>
                  <th>商品</th>
                  <th>仓库</th>
                  <th>类型</th>
                  <th className="text-right">变动数量</th>
                  <th className="text-right">变动后余额</th>
                  <th className="text-right">单位成本</th>
                  <th>关联单据</th>
                  <th>操作人</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="w-10 pr-0">
                      <TableCheckbox
                        checked={selection.selected.has(String(entry.id))}
                        onChange={(checked) => selection.toggle(String(entry.id), checked)}
                        label={`选择 ${entry.ref_no || entry.product_name} 流水`}
                      />
                    </td>
                    <td className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td>
                      <p className="text-[13px] font-medium">{entry.product_name}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase text-muted-foreground">{entry.sku}</p>
                    </td>
                    <td className="text-[12px] text-muted-foreground">{entry.warehouse_name}</td>
                    <td>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                          MOVEMENT_TONES[entry.movement_type] === "default" &&
                            "bg-blue-50 text-blue-700 ring-blue-200/70",
                          MOVEMENT_TONES[entry.movement_type] === "secondary" &&
                            "bg-violet-50 text-violet-700 ring-violet-200/70",
                          MOVEMENT_TONES[entry.movement_type] === "warning" &&
                            "bg-amber-50 text-amber-700 ring-amber-200/70",
                          MOVEMENT_TONES[entry.movement_type] === "success" &&
                            "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
                          MOVEMENT_TONES[entry.movement_type] === "danger" &&
                            "bg-red-50 text-red-700 ring-red-200/70",
                        )}
                      >
                        {movementLabel(entry.movement_type)}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "text-right text-[13px] font-semibold tabular",
                        entry.change_qty > 0 ? "text-emerald-700" : "text-rose-700",
                      )}
                    >
                      {formatSignedQty(entry.change_qty)}
                    </td>
                    <td className="text-right text-[12px] tabular">{formatQty(entry.balance_after)}</td>
                    <td className="text-right text-[12px] text-muted-foreground tabular">
                      {entry.unit_cost ? formatMoney(entry.unit_cost) : "—"}
                    </td>
                    <td>
                      <p className="max-w-[150px] truncate text-[11px] font-medium text-blue-700">
                        {entry.ref_no || "—"}
                      </p>
                      {entry.remark ? (
                        <p className="max-w-[170px] truncate text-[10px] text-muted-foreground">{entry.remark}</p>
                      ) : null}
                    </td>
                    <td className="text-[11px] text-muted-foreground">{entry.created_by_name || "系统"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            total={ledger.data?.total ?? 0}
            page={ledger.data?.page ?? page}
            pageSize={pageSize}
            pages={ledger.data?.pages ?? 1}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      <p className="mt-4 text-[11px] text-muted-foreground">
        流水按创建时间倒序展示。库存流水不可编辑或删除；如需修正，请使用库存调整并填写原因。
      </p>
    </div>
  );
}
