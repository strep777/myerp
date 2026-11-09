import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownUp,
  ArrowUpRight,
  Layers,
  SlidersHorizontal,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { useApi, useDebouncedValue, useDocumentTitle } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import type {
  AdjustmentResult,
  Balance,
  InventoryOverview,
  Page,
  ProductOption,
  WarehouseOption,
} from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { SelectionBar, TableCheckbox, useTableSelection } from "@/components/common/table-selection";
import { ProductPicker } from "@/components/common/product-picker";
import { FormField } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Layers;
  tone: string;
}) {
  return (
    <div className="app-card flex items-start justify-between p-4">
      <div>
        <p className="field-label">{label}</p>
        <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.04em] tabular">{value}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      </div>
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-4 w-4" strokeWidth={1.7} />
      </span>
    </div>
  );
}

interface AdjustmentState {
  product: ProductOption;
  warehouseId: number;
  quantity: string;
  reason: string;
}

function AdjustmentDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdjustmentState | null;
  onSaved: () => void;
}) {
  const warehouses = useApi<WarehouseOption[]>("/warehouses/options");
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProduct(initial?.product ?? null);
    setWarehouseId(initial?.warehouseId ? String(initial.warehouseId) : "");
    setQuantity(initial?.quantity ?? "");
    setReason(initial?.reason ?? "");
    setErrors({});
    setError(null);
  }, [open, initial]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!product) nextErrors.product_id = "请选择商品";
    if (!warehouseId) nextErrors.warehouse_id = "请选择仓库";
    const change = Number(quantity);
    if (!quantity.trim() || !Number.isFinite(change) || change === 0) {
      nextErrors.quantity_change = "请输入非 0 的调整数量，减少请填负数";
    }
    if (reason.trim().length < 2) nextErrors.reason = "请填写至少 2 个字的调整原因";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    setError(null);
    setErrors({});
    try {
      const result = await api.post<AdjustmentResult>("/inventory/adjustments", {
        product_id: product?.id,
        warehouse_id: Number(warehouseId),
        quantity_change: change,
        reason: reason.trim(),
      });
      toast.success(`已调整 ${result.sku} ${result.change_qty > 0 ? "+" : ""}${formatQty(result.change_qty)}`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields || {});
        setError(err.message);
      } else {
        setError("调整失败，请稍后重试");
      }
    } finally {
      setSaving(false);
    }
  };

  const warehouseOptions = (warehouses.data ?? []).map((warehouse) => ({
    value: String(warehouse.id),
    label: `${warehouse.name} · ${warehouse.code}`,
  }));

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>库存调整</DialogTitle>
            <DialogDescription>
              用于期初录入、盘盈盘亏修正等例外场景。调整会生成不可篡改的库存流水。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="py-2">
            <div className="space-y-4">
              <FormField label="商品" required error={errors.product_id || errors.product}>
                <ProductPicker
                  selected={product}
                  onChange={setProduct}
                  invalid={Boolean(errors.product_id || errors.product)}
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="仓库" htmlFor="adjust-warehouse" required error={errors.warehouse_id}>
                  <Select
                    id="adjust-warehouse"
                    value={warehouseId}
                    onValueChange={setWarehouseId}
                    options={warehouseOptions}
                    placeholder="选择仓库"
                  />
                </FormField>
                <FormField
                  label="调整数量"
                  htmlFor="adjust-quantity"
                  required
                  error={errors.quantity_change}
                  hint="正数增加，负数减少，最多 4 位小数"
                >
                  <Input
                    id="adjust-quantity"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    placeholder="例如 10 或 -2.5"
                    className="tabular"
                  />
                </FormField>
              </div>
              <FormField label="调整原因" htmlFor="adjust-reason" required error={errors.reason}>
                <Textarea
                  id="adjust-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="例如：期初库存录入 / 盘点后差异修正"
                  rows={2}
                />
              </FormField>
              <div className="flex gap-2 rounded-lg bg-amber-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>库存不允许为负数；减少数量超过当前库存时，调整会整笔失败。请优先使用入库、出库和盘点单据。</p>
              </div>
              {error ? (
                <p className="rounded-lg bg-destructive/[0.06] px-3 py-2 text-[12px] text-destructive">{error}</p>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button type="submit" loading={saving}>
              确认调整
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InventoryPage() {
  useDocumentTitle("库存余额");
  const [q, setQ] = useState("");
  const [warehouseId, setWarehouseId] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [includeZero, setIncludeZero] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const debouncedQ = useDebouncedValue(q);

  const warehouses = useApi<WarehouseOption[]>("/warehouses/options");
  const overview = useApi<InventoryOverview>("/inventory/overview", {
    warehouse_id: warehouseId === "all" ? undefined : warehouseId,
  });
  const balances = useApi<Page<Balance>>("/inventory/balances", {
    q: debouncedQ,
    warehouse_id: warehouseId === "all" ? undefined : warehouseId,
    low_stock: lowOnly ? true : undefined,
    include_zero: includeZero ? true : undefined,
    page,
    page_size: pageSize,
  });

  useEffect(() => setPage(1), [debouncedQ, warehouseId, lowOnly, includeZero]);

  const warehouseOptions = [
    { value: "all", label: "全部仓库" },
    ...(warehouses.data ?? []).map((warehouse) => ({
      value: String(warehouse.id),
      label: warehouse.name,
    })),
  ];

  const reload = () => {
    balances.reload();
    overview.reload();
  };

  const items = balances.data?.items ?? [];
  const selection = useTableSelection(items, (item) => `${item.product_id}-${item.warehouse_id}`);

  return (
    <div>
      <PageHeader
        title="库存余额"
        description="按商品与仓库查看实时库存、平均成本和库存价值；请到商品页面清空库存或删除商品。"
        actions={
          <Button variant="secondary" asChild>
            <Link to="/inventory/ledger">
              <ArrowDownUp className="h-4 w-4" />
              库存流水
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="商品种类"
          value={formatQty(overview.data?.sku_count ?? 0)}
          hint="当前仓库中有库存的 SKU"
          icon={Layers}
          tone="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="库存总量"
          value={formatQty(overview.data?.total_quantity ?? 0)}
          hint="所有商品数量合计"
          icon={ArrowDownUp}
          tone="bg-teal-50 text-teal-600"
        />
        <StatCard
          label="库存价值"
          value={formatMoney(overview.data?.total_value ?? 0)}
          hint="按移动加权平均成本计算"
          icon={Wallet}
          tone="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="低库存"
          value={formatQty(overview.data?.low_stock_count ?? 0)}
          hint="数量低于安全库存的 SKU"
          icon={TriangleAlert}
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="搜索商品名称、SKU 或分类"
          className="w-full sm:max-w-[290px]"
        />
        <Select
          value={warehouseId}
          onValueChange={setWarehouseId}
          options={warehouseOptions}
          className="h-9 sm:w-[190px]"
        />
        <Button
          type="button"
          variant={lowOnly ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => setLowOnly((value) => !value)}
        >
          <TriangleAlert className="h-3.5 w-3.5" />
          仅看低库存
        </Button>
        <Button
          type="button"
          variant={includeZero ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => setIncludeZero((value) => !value)}
        >
          显示零库存
        </Button>
        <p className="ml-auto text-[11px] text-muted-foreground">
          {balances.data ? `共 ${balances.data.total} 条库存记录` : "正在加载…"}
        </p>
      </div>

      {balances.loading ? (
        <TableSkeleton columns={7} />
      ) : balances.error ? (
        <div className="app-card">
          <ErrorState message={balances.error} onRetry={reload} />
        </div>
      ) : items.length === 0 ? (
        <div className="app-card">
          <EmptyState
            icon={Layers}
            title={lowOnly ? "没有低库存商品" : "暂无库存记录"}
            description={
              lowOnly
                ? "当前筛选下所有商品库存都高于安全库存。"
                : "完成一笔入库单后，库存余额会显示在这里。"
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
                .map((item) => `${item.sku}\t${item.product_name}\t${item.warehouse_name}\t${formatQty(item.quantity)}${item.unit}`)
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
                      label="全选当前页库存"
                    />
                  </th>
                  <th>商品</th>
                  <th>仓库</th>
                  <th className="text-right">可用数量</th>
                  <th className="text-right">平均成本</th>
                  <th className="text-right">库存价值</th>
                  <th>安全库存</th>
                  <th>最近变动</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={`${row.product_id}-${row.warehouse_id}`}>
                    <td className="w-10 pr-0">
                      <TableCheckbox
                        checked={selection.selected.has(`${row.product_id}-${row.warehouse_id}`)}
                        onChange={(checked) => selection.toggle(`${row.product_id}-${row.warehouse_id}`, checked)}
                        label={`选择 ${row.product_name} 在 ${row.warehouse_name}`}
                      />
                    </td>
                    <td>
                      <p className="text-[13px] font-medium">{row.product_name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="font-mono uppercase">{row.sku}</span>
                        {row.category ? (
                          <>
                            <span>·</span>
                            <span>{row.category}</span>
                          </>
                        ) : null}
                      </p>
                    </td>
                    <td className="text-[12px] text-muted-foreground">{row.warehouse_name}</td>
                    <td className="text-right">
                      <span className={cn("text-[13px] font-semibold tabular", row.is_low && "text-amber-700")}>
                        {formatQty(row.quantity)}
                      </span>
                      <span className="ml-1 text-[10px] text-muted-foreground">{row.unit}</span>
                      {row.is_low ? (
                        <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
                      ) : null}
                    </td>
                    <td className="text-right text-[12px] text-muted-foreground tabular">
                      {formatMoney(row.avg_cost)}
                    </td>
                    <td className="text-right text-[12px] font-medium tabular">{formatMoney(row.stock_value)}</td>
                    <td className="text-[12px] text-muted-foreground tabular">{formatQty(row.safety_stock)}</td>
                    <td className="text-[11px] text-muted-foreground">{formatDateTime(row.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            total={balances.data?.total ?? 0}
            page={balances.data?.page ?? page}
            pageSize={pageSize}
            pages={balances.data?.pages ?? 1}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-[11px] text-blue-800">
        <ArrowUpRight className="h-4 w-4 shrink-0 text-blue-500" />
        <p>
          库存价值使用移动加权平均成本。若数量为 0，平均成本会归零；下一笔入库会重新建立成本。
        </p>
      </div>

    </div>
  );
}
