import { useState, type ReactNode } from "react";
import { BarChart3, Download, FileBarChart, PackageSearch, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { ApiError, downloadCsv } from "@/lib/api";
import { useApi, useDocumentTitle } from "@/hooks/use-api";
import type {
  FlowSummaryPage,
  LedgerEntry,
  LowStockItem,
  Page,
  StockReportPage,
  WarehouseOption,
} from "@/lib/types";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQty,
  formatSignedQty,
  monthStartLocal,
  MOVEMENT_LABELS,
  MOVEMENT_OPTIONS,
  todayLocal,
} from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { SelectionBar, TableCheckbox, useTableSelection } from "@/components/common/table-selection";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ReportTab = "stock" | "low" | "flow" | "ledger";

const TABS: { value: ReportTab; label: string; icon: typeof BarChart3 }[] = [
  { value: "stock", label: "库存汇总", icon: PackageSearch },
  { value: "low", label: "低库存", icon: BarChart3 },
  { value: "flow", label: "收发存", icon: FileBarChart },
  { value: "ledger", label: "库存流水", icon: FileBarChart },
];

export function ReportsPage() {
  useDocumentTitle("报表");
  const [tab, setTab] = useState<ReportTab>("stock");
  const [q, setQ] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [category, setCategory] = useState("");
  const [includeZero, setIncludeZero] = useState(false);
  const [dateFrom, setDateFrom] = useState(monthStartLocal());
  const [dateTo, setDateTo] = useState(todayLocal());
  const [movementType, setMovementType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const warehouses = useApi<WarehouseOption[]>("/warehouses/options", { limit: 50 });
  const common = { warehouse_id: warehouseId || undefined, category: category || undefined, q: q || undefined };

  const stock = useApi<StockReportPage>("/reports/stock-summary", {
    ...common, include_zero: includeZero, page, page_size: pageSize,
  }, { enabled: tab === "stock" });
  const low = useApi<Page<LowStockItem>>("/reports/low-stock", {
    ...common, page, page_size: pageSize,
  }, { enabled: tab === "low" });
  const flow = useApi<FlowSummaryPage>("/reports/flow-summary", {
    ...common, date_from: dateFrom || undefined, date_to: dateTo || undefined, page, page_size: pageSize,
  }, { enabled: tab === "flow" });
  const ledger = useApi<Page<LedgerEntry>>("/reports/ledger", {
    warehouse_id: warehouseId || undefined,
    movement_type: movementType || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page, page_size: pageSize,
  }, { enabled: tab === "ledger" });

  const stockItems = stock.data?.items ?? [];
  const lowItems = low.data?.items ?? [];
  const flowItems = flow.data?.items ?? [];
  const ledgerItems = ledger.data?.items ?? [];
  const stockSelection = useTableSelection(stockItems, (item) => `${item.product_id}-${item.warehouse_id}`);
  const lowSelection = useTableSelection(lowItems, (item) => `${item.product_id}-${item.warehouse_id}`);
  const flowSelection = useTableSelection(flowItems, (item) => String(item.product_id));
  const ledgerSelection = useTableSelection(ledgerItems, (item) => String(item.id));

  const applyTab = (value: string) => {
    setTab(value as ReportTab);
    setPage(1);
  };

  const resetPage = () => setPage(1);

  const exportCurrent = async () => {
    try {
      if (tab === "stock") {
        await downloadCsv("/reports/export/stock.csv", { ...common, include_zero: includeZero }, "stock.csv");
      } else if (tab === "flow") {
        await downloadCsv("/reports/export/flow.csv", { ...common, date_from: dateFrom, date_to: dateTo }, "flow.csv");
      } else if (tab === "ledger") {
        await downloadCsv("/reports/export/ledger.csv", { warehouse_id: warehouseId || undefined, movement_type: movementType || undefined, date_from: dateFrom, date_to: dateTo }, "ledger.csv");
      } else {
        await downloadCsv("/reports/export/stock.csv", { ...common, include_zero: true }, "low-stock.csv");
      }
      toast.success("CSV 已开始下载");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "导出失败，请稍后重试");
    }
  };

  const active = tab === "stock" ? stock : tab === "low" ? low : tab === "flow" ? flow : ledger;

  return (
    <div>
      <PageHeader
        title="报表"
        description="库存价值、低库存预警、收发存汇总与流水追溯，支持导出 CSV。"
        actions={
          <Button variant="secondary" onClick={() => void exportCurrent()}>
            <Download className="h-4 w-4" />
            导出 CSV
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={applyTab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={q}
            onChange={(value) => { setQ(value); resetPage(); }}
            placeholder="搜索 SKU / 商品名称"
            className="w-full sm:w-60"
          />
          <Select
            value={warehouseId || "ALL"}
            onValueChange={(value) => { setWarehouseId(value === "ALL" ? "" : value); resetPage(); }}
            options={[{ value: "ALL", label: "全部仓库" }, ...(warehouses.data ?? []).map((w) => ({ value: String(w.id), label: w.name }))]}
            className="w-40"
          />
          <Input
            value={category}
            onChange={(event) => { setCategory(event.target.value); resetPage(); }}
            placeholder="分类筛选"
            className="w-32"
          />
          {tab === "stock" ? (
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 text-[12px]">
              <input
                type="checkbox"
                checked={includeZero}
                onChange={(event) => { setIncludeZero(event.target.checked); resetPage(); }}
                className="h-3.5 w-3.5 accent-[#007AFF]"
              />
              含零库存
            </label>
          ) : null}
          {(tab === "flow" || tab === "ledger") ? (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={dateFrom} max={dateTo} onChange={(event) => { setDateFrom(event.target.value); resetPage(); }} className="w-[136px]" aria-label="开始日期" />
              <span className="text-muted-foreground">–</span>
              <Input type="date" value={dateTo} min={dateFrom} max={todayLocal()} onChange={(event) => { setDateTo(event.target.value); resetPage(); }} className="w-[136px]" aria-label="结束日期" />
            </div>
          ) : null}
          {tab === "ledger" ? (
            <Select
              value={movementType || "ALL"}
              onValueChange={(value) => { setMovementType(value === "ALL" ? "" : value); resetPage(); }}
              options={[{ value: "ALL", label: "全部类型" }, ...MOVEMENT_OPTIONS]}
              className="w-32"
            />
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => active.reload()} disabled={active.loading}>
            <RefreshCw className="h-3.5 w-3.5" />刷新
          </Button>
          <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            {tab === "stock" && stock.data ? <span>库存价值 <strong className="text-foreground">{formatMoney(stock.data.total_value)}</strong></span> : null}
            {tab === "flow" && flow.data ? <span>{formatDate(flow.data.date_from)} 至 {formatDate(flow.data.date_to)}</span> : null}
          </div>
        </div>

        <TabsContent value="stock">
          <ReportShell loading={stock.loading} error={stock.error} empty={!stock.data?.items.length} onRetry={stock.reload} emptyTitle="暂无库存数据">
            {stock.data ? (
              <>
                <SelectionBar
                  count={stockSelection.selectedCount}
                  total={stockItems.length}
                  allSelected={stockSelection.allSelected}
                  onToggleAll={stockSelection.toggleAll}
                  copyText={() =>
                    stockSelection.selectedRows
                      .map((item) => `${item.sku}\t${item.product_name}\t${item.warehouse_name}\t${formatQty(item.quantity)}`)
                      .join("\n")
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-[12px]">
                    <thead className="border-b border-black/[0.06] bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-10 px-4 py-2.5 font-medium">
                          <TableCheckbox
                            checked={stockSelection.allSelected}
                            indeterminate={stockSelection.someSelected}
                            onChange={stockSelection.toggleAll}
                            label="全选当前页库存"
                          />
                        </th>
                        <th className="px-4 py-2.5 font-medium">商品</th>
                        <th className="px-3 py-2.5 font-medium">仓库</th>
                        <th className="px-3 py-2.5 font-medium">分类</th>
                        <th className="px-3 py-2.5 text-right font-medium">数量</th>
                        <th className="px-3 py-2.5 text-right font-medium">平均成本</th>
                        <th className="px-3 py-2.5 text-right font-medium">库存价值</th>
                        <th className="px-4 py-2.5 text-right font-medium">更新时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.05]">
                      {stock.data.items.map((item) => (
                        <tr key={`${item.product_id}-${item.warehouse_id}`}>
                          <td className="w-10 px-4 py-2.5 pr-0">
                            <TableCheckbox
                              checked={stockSelection.selected.has(`${item.product_id}-${item.warehouse_id}`)}
                              onChange={(checked) => stockSelection.toggle(`${item.product_id}-${item.warehouse_id}`, checked)}
                              label={`选择 ${item.product_name}`}
                            />
                          </td>
                          <td className="px-4 py-2.5"><p className="font-medium">{item.product_name}</p><p className="font-mono text-[10px] text-muted-foreground">{item.sku}</p></td>
                          <td className="px-3 py-2.5 text-muted-foreground">{item.warehouse_name}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{item.category || "—"}</td>
                          <td className="px-3 py-2.5 text-right font-medium tabular">{formatQty(item.quantity)} <span className="text-[10px] text-muted-foreground">{item.unit}</span></td>
                          <td className="px-3 py-2.5 text-right tabular text-muted-foreground">{formatMoney(item.avg_cost)}</td>
                          <td className="px-3 py-2.5 text-right font-medium tabular">{formatMoney(item.stock_value)}</td>
                          <td className="px-4 py-2.5 text-right text-[11px] text-muted-foreground">{formatDateTime(item.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={stock.data.page} pageSize={stock.data.page_size} total={stock.data.total} pages={stock.data.pages} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
              </>
            ) : null}
          </ReportShell>
        </TabsContent>

        <TabsContent value="low">
          <ReportShell loading={low.loading} error={low.error} empty={!low.data?.items.length} onRetry={low.reload} emptyTitle="没有低库存商品" emptyDescription="所有商品库存都高于安全库存，继续保持。">
            {low.data ? (
              <>
                <SelectionBar
                  count={lowSelection.selectedCount}
                  total={lowItems.length}
                  allSelected={lowSelection.allSelected}
                  onToggleAll={lowSelection.toggleAll}
                  copyText={() =>
                    lowSelection.selectedRows
                      .map((item) => `${item.sku}\t${item.product_name}\t${item.warehouse_name}\t${formatQty(item.quantity)}\t${formatQty(item.shortage)}`)
                      .join("\n")
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-left text-[12px]">
                    <thead className="border-b border-black/[0.06] bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-10 px-4 py-2.5 font-medium">
                          <TableCheckbox
                            checked={lowSelection.allSelected}
                            indeterminate={lowSelection.someSelected}
                            onChange={lowSelection.toggleAll}
                            label="全选当前页低库存"
                          />
                        </th>
                        <th className="px-4 py-2.5 font-medium">商品</th>
                        <th className="px-3 py-2.5 font-medium">仓库</th>
                        <th className="px-3 py-2.5 text-right font-medium">当前库存</th>
                        <th className="px-3 py-2.5 text-right font-medium">安全库存</th>
                        <th className="px-3 py-2.5 text-right font-medium">缺口</th>
                        <th className="px-4 py-2.5 text-right font-medium">建议补货</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.05]">
                      {low.data.items.map((item) => (
                        <tr key={`${item.product_id}-${item.warehouse_id}`}>
                          <td className="w-10 px-4 py-2.5 pr-0">
                            <TableCheckbox
                              checked={lowSelection.selected.has(`${item.product_id}-${item.warehouse_id}`)}
                              onChange={(checked) => lowSelection.toggle(`${item.product_id}-${item.warehouse_id}`, checked)}
                              label={`选择 ${item.product_name}`}
                            />
                          </td>
                          <td className="px-4 py-2.5"><p className="font-medium">{item.product_name}</p><p className="font-mono text-[10px] text-muted-foreground">{item.sku}</p></td>
                          <td className="px-3 py-2.5 text-muted-foreground">{item.warehouse_name}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular text-rose-700">{formatQty(item.quantity)}</td>
                          <td className="px-3 py-2.5 text-right tabular text-muted-foreground">{formatQty(item.safety_stock)}</td>
                          <td className="px-3 py-2.5 text-right tabular text-rose-700">{formatQty(item.shortage)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular text-emerald-700">{formatQty(item.recommended_qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={low.data.page} pageSize={low.data.page_size} total={low.data.total} pages={low.data.pages} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
              </>
            ) : null}
          </ReportShell>
        </TabsContent>

        <TabsContent value="flow">
          <ReportShell loading={flow.loading} error={flow.error} empty={!flow.data?.items.length} onRetry={flow.reload} emptyTitle="所选期间没有收发存数据">
            {flow.data ? (
              <>
                <SelectionBar
                  count={flowSelection.selectedCount}
                  total={flowItems.length}
                  allSelected={flowSelection.allSelected}
                  onToggleAll={flowSelection.toggleAll}
                  copyText={() =>
                    flowSelection.selectedRows
                      .map((item) => `${item.sku}\t${item.product_name}\t${formatQty(item.closing_qty)}`)
                      .join("\n")
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[930px] text-left text-[12px]">
                    <thead className="border-b border-black/[0.06] bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-10 px-4 py-2.5 font-medium">
                          <TableCheckbox
                            checked={flowSelection.allSelected}
                            indeterminate={flowSelection.someSelected}
                            onChange={flowSelection.toggleAll}
                            label="全选当前页收发存"
                          />
                        </th>
                        <th className="px-4 py-2.5 font-medium">商品</th>
                        <th className="px-3 py-2.5 text-right font-medium">期初</th>
                        <th className="px-3 py-2.5 text-right font-medium">入库</th>
                        <th className="px-3 py-2.5 text-right font-medium">出库</th>
                        <th className="px-3 py-2.5 text-right font-medium">调整</th>
                        <th className="px-3 py-2.5 text-right font-medium">期末</th>
                        <th className="px-4 py-2.5 text-right font-medium">期末价值</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.05]">
                      {flow.data.items.map((item) => (
                        <tr key={item.product_id}>
                          <td className="w-10 px-4 py-2.5 pr-0">
                            <TableCheckbox
                              checked={flowSelection.selected.has(String(item.product_id))}
                              onChange={(checked) => flowSelection.toggle(String(item.product_id), checked)}
                              label={`选择 ${item.product_name}`}
                            />
                          </td>
                          <td className="px-4 py-2.5"><p className="font-medium">{item.product_name}</p><p className="font-mono text-[10px] text-muted-foreground">{item.sku}</p></td>
                          <td className="px-3 py-2.5 text-right tabular text-muted-foreground">{formatQty(item.opening_qty)}</td>
                          <td className="px-3 py-2.5 text-right tabular text-emerald-700">+{formatQty(item.inbound_qty)}</td>
                          <td className="px-3 py-2.5 text-right tabular text-rose-700">−{formatQty(item.outbound_qty)}</td>
                          <td className="px-3 py-2.5 text-right tabular">{formatSignedQty(item.adjust_qty)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular">{formatQty(item.closing_qty)}</td>
                          <td className="px-4 py-2.5 text-right font-medium tabular">{formatMoney(item.closing_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={flow.data.page} pageSize={flow.data.page_size} total={flow.data.total} pages={flow.data.pages} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
              </>
            ) : null}
          </ReportShell>
        </TabsContent>

        <TabsContent value="ledger">
          <ReportShell loading={ledger.loading} error={ledger.error} empty={!ledger.data?.items.length} onRetry={ledger.reload} emptyTitle="所选期间没有流水">
            {ledger.data ? (
              <>
                <SelectionBar
                  count={ledgerSelection.selectedCount}
                  total={ledgerItems.length}
                  allSelected={ledgerSelection.allSelected}
                  onToggleAll={ledgerSelection.toggleAll}
                  copyText={() =>
                    ledgerSelection.selectedRows
                      .map((item) => `${formatDateTime(item.created_at)}\t${item.movement_type}\t${item.sku}\t${item.product_name}\t${formatSignedQty(item.change_qty)}`)
                      .join("\n")
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-[12px]">
                    <thead className="border-b border-black/[0.06] bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-10 px-4 py-2.5 font-medium">
                          <TableCheckbox
                            checked={ledgerSelection.allSelected}
                            indeterminate={ledgerSelection.someSelected}
                            onChange={ledgerSelection.toggleAll}
                            label="全选当前页流水"
                          />
                        </th>
                        <th className="px-4 py-2.5 font-medium">时间</th>
                        <th className="px-3 py-2.5 font-medium">类型</th>
                        <th className="px-3 py-2.5 font-medium">商品</th>
                        <th className="px-3 py-2.5 font-medium">仓库</th>
                        <th className="px-3 py-2.5 text-right font-medium">变动</th>
                        <th className="px-3 py-2.5 text-right font-medium">变动后</th>
                        <th className="px-4 py-2.5 font-medium">关联单号</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.05]">
                      {ledger.data.items.map((item) => (
                        <tr key={item.id}>
                          <td className="w-10 px-4 py-2.5 pr-0">
                            <TableCheckbox
                              checked={ledgerSelection.selected.has(String(item.id))}
                              onChange={(checked) => ledgerSelection.toggle(String(item.id), checked)}
                              label={`选择流水 ${item.id}`}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-[11px] text-muted-foreground">{formatDateTime(item.created_at)}</td>
                          <td className="px-3 py-2.5 text-[11px]">{MOVEMENT_LABELS[item.movement_type] ?? item.movement_type}</td>
                          <td className="px-3 py-2.5"><p className="font-medium">{item.product_name}</p><p className="font-mono text-[10px] text-muted-foreground">{item.sku}</p></td>
                          <td className="px-3 py-2.5 text-muted-foreground">{item.warehouse_name}</td>
                          <td className={`px-3 py-2.5 text-right font-semibold tabular ${item.change_qty > 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatSignedQty(item.change_qty)}</td>
                          <td className="px-3 py-2.5 text-right tabular">{formatQty(item.balance_after)}</td>
                          <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{item.ref_no || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={ledger.data.page} pageSize={ledger.data.page_size} total={ledger.data.total} pages={ledger.data.pages} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
              </>
            ) : null}
          </ReportShell>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportShell({
  loading,
  error,
  empty,
  emptyTitle,
  emptyDescription,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <div className="app-card overflow-hidden">
      {loading ? <TableSkeleton columns={6} /> : error ? <ErrorState message={error} onRetry={onRetry} /> : empty ? (
        <EmptyState icon={Search} title={emptyTitle} description={emptyDescription} />
      ) : children}
    </div>
  );
}
