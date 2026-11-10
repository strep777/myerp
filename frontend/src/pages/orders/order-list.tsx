import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FilterX, Pencil, Plus, Search } from "lucide-react";
import { useApi, useDebouncedValue, useDocumentTitle } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import type { Page, PartnerOption, WarehouseOption } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { BulkDeleteDialog } from "@/components/common/bulk-delete-dialog";
import { SelectionBar, TableCheckbox, useTableSelection } from "@/components/common/table-selection";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ORDER_META, type OrderSummary, type OrderType } from "./order-meta";

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "DRAFT", label: "草稿" },
  { value: "CONFIRMED", label: "已确认" },
  { value: "CANCELLED", label: "已取消" },
];

export function OrderListPage({ type }: { type: OrderType }) {
  const meta = ORDER_META[type];
  const Icon = meta.icon;
  const navigate = useNavigate();
  const { canWriteDocs } = useAuth();
  useDocumentTitle(meta.title);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [partnerId, setPartnerId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const debouncedQ = useDebouncedValue(q);

  const warehouses = useApi<WarehouseOption[]>("/warehouses/options");
  const partners = useApi<PartnerOption[]>(
    type === "inbound" ? "/suppliers/options" : "/customers/options",
    undefined,
    { enabled: type !== "transfer" },
  );

  const params = {
    q: debouncedQ || undefined,
    status: status === "all" ? undefined : status,
    page,
    page_size: pageSize,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ...(type === "transfer"
      ? { from_warehouse_id: warehouseId === "all" ? undefined : warehouseId }
      : { warehouse_id: warehouseId === "all" ? undefined : warehouseId }),
    ...(type === "inbound"
      ? { supplier_id: partnerId === "all" ? undefined : partnerId }
      : type === "outbound"
        ? { customer_id: partnerId === "all" ? undefined : partnerId }
        : {}),
  };

  const orders = useApi<Page<OrderSummary>>(meta.api, params);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, warehouseId, partnerId, dateFrom, dateTo, pageSize]);

  const resetFilters = () => {
    setQ("");
    setStatus("all");
    setWarehouseId("all");
    setPartnerId("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasFilters =
    Boolean(q) ||
    status !== "all" ||
    warehouseId !== "all" ||
    partnerId !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const warehouseOptions = [
    { value: "all", label: type === "transfer" ? "全部调出仓" : "全部仓库" },
    ...(warehouses.data ?? []).map((warehouse) => ({
      value: String(warehouse.id),
      label: warehouse.name,
    })),
  ];

  const partnerOptions = [
    {
      value: "all",
      label: type === "inbound" ? "全部供应商" : type === "outbound" ? "全部客户" : "全部",
    },
    ...(partners.data ?? []).map((partner) => ({ value: String(partner.id), label: partner.name })),
  ];

  const items = orders.data?.items ?? [];
  const selection = useTableSelection(items, (item) => String(item.id));

  return (
    <div>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          canWriteDocs ? (
            <Button asChild>
              <Link to={`${meta.path}/new`}>
                <Plus className="h-4 w-4" />
                {meta.newTitle}
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="app-card mb-4 p-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder={`搜索单号、关联单号${type === "transfer" ? "" : "或对方名称"}`}
            />
          </div>
          <div>
            <p className="field-label">状态</p>
            <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
          </div>
          <div>
            <p className="field-label">{type === "transfer" ? "调出仓库" : "仓库"}</p>
            <Select value={warehouseId} onValueChange={setWarehouseId} options={warehouseOptions} />
          </div>
          {type !== "transfer" ? (
            <div>
              <p className="field-label">{type === "inbound" ? "供应商" : "客户"}</p>
              <Select value={partnerId} onValueChange={setPartnerId} options={partnerOptions} />
            </div>
          ) : null}
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
          <div className="flex items-end gap-2">
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
            <p className="pb-2 text-[11px] text-muted-foreground">
              {orders.data ? `共 ${orders.data.total} 张` : "加载中…"}
            </p>
          </div>
        </div>
      </div>

      {orders.loading ? (
        <TableSkeleton columns={8} />
      ) : orders.error ? (
        <div className="app-card">
          <ErrorState message={orders.error} onRetry={orders.reload} />
        </div>
      ) : items.length === 0 ? (
        <div className="app-card">
          <EmptyState
            icon={Icon}
            title={hasFilters ? `没有匹配的${meta.singular}` : meta.emptyTitle}
            description={
              hasFilters
                ? "试试调整状态、仓库、对方或日期范围。"
                : `创建${meta.singular}后，在草稿状态可以继续编辑，确认后自动更新库存。`
            }
            actionLabel={canWriteDocs ? meta.newTitle : undefined}
            onAction={canWriteDocs ? () => navigate(`${meta.path}/new`) : undefined}
          />
        </div>
      ) : (
        <>
          <SelectionBar
            count={selection.selectedCount}
            total={items.length}
            allSelected={selection.allSelected}
            onToggleAll={selection.toggleAll}
            onDelete={canWriteDocs ? () => setBulkDeleteOpen(true) : undefined}
            copyText={() =>
              selection.selectedRows
                .map((item) => `${item.order_no}\t${item.status}\t${item.total_quantity}`)
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
                      label={`全选当前页${meta.singular}`}
                    />
                  </th>
                  <th>{meta.singular}</th>
                  <th>{type === "transfer" ? "调拨路径" : type === "inbound" ? "供应商" : "客户"}</th>
                  <th>{type === "transfer" ? "调出仓库" : "仓库"}</th>
                  <th className="text-right">总数量</th>
                  {type === "inbound" ? <th className="text-right">总金额</th> : null}
                  <th className="text-right">明细行</th>
                  <th>状态</th>
                  <th>创建人</th>
                  <th className="w-[100px] text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((order) => (
                  <tr key={order.id}>
                    <td className="w-10 pr-0">
                      <TableCheckbox
                        checked={selection.selected.has(String(order.id))}
                        onChange={(checked) => selection.toggle(String(order.id), checked)}
                        label={`选择 ${order.order_no}`}
                      />
                    </td>
                    <td>
                      <Link
                        to={`${meta.path}/${order.id}`}
                        className="text-[12px] font-semibold text-primary hover:underline"
                      >
                        {order.order_no}
                      </Link>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {formatDate(order.created_at)}
                      </p>
                    </td>
                    <td className="max-w-[180px]">
                      {type === "transfer" ? (
                        <span className="text-[12px]">
                          {"from_warehouse_name" in order ? order.from_warehouse_name : "—"}
                          <span className="mx-1.5 text-muted-foreground">→</span>
                          {"to_warehouse_name" in order ? order.to_warehouse_name : "—"}
                        </span>
                      ) : (
                        <span className="block truncate text-[12px]">
                          {"supplier_name" in order
                            ? order.supplier_name || "未指定"
                            : "customer_name" in order
                              ? order.customer_name || "未指定"
                              : "—"}
                        </span>
                      )}
                    </td>
                    <td className="text-[12px] text-muted-foreground">
                      {"warehouse_name" in order ? order.warehouse_name : "—"}
                    </td>
                    <td className="text-right text-[12px] font-medium tabular">
                      {formatQty(order.total_quantity)}
                    </td>
                    {type === "inbound" ? (
                      <td className="text-right text-[12px] tabular">
                        {"total_amount" in order ? formatMoney(order.total_amount) : "—"}
                      </td>
                    ) : null}
                    <td className="text-right text-[12px] text-muted-foreground tabular">
                      {order.line_count}
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="text-[11px] text-muted-foreground">{order.created_by_name}</td>
                    <td>
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`${meta.path}/${order.id}`}>查看</Link>
                        </Button>
                        {order.status === "DRAFT" && canWriteDocs ? (
                          <Button variant="ghost" size="icon-sm" asChild aria-label="编辑草稿">
                            <Link to={`${meta.path}/${order.id}/edit`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            total={orders.data?.total ?? 0}
            page={orders.data?.page ?? page}
            pageSize={pageSize}
            pages={orders.data?.pages ?? 1}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Search className="h-3.5 w-3.5" />
        提示：草稿可以自由修改；确认后库存立即变动，单据不可再编辑或删除。
      </p>

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        rows={selection.selectedRows}
        entityLabel={meta.singular}
        getPath={(order) => `${meta.api}/${order.id}`}
        getLabel={(order) => order.order_no}
        description={`只有草稿状态的${meta.singular}可以删除。已确认或已取消的单据会保留，并说明原因。`}
        onDone={() => {
          orders.reload();
          selection.clear();
        }}
      />
    </div>
  );
}
