import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileClock,
  Package,
  Plus,
  TrendingUp,
  Warehouse,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApi, useDocumentTitle } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import {
  formatMoney as money,
  formatQty as qty,
  formatRelative as relative,
  greeting,
  longDate,
} from "@/lib/format";
import type {
  DashboardSummary,
  LowStockItem,
  RecentDocument,
  TrendItem,
  WarehouseOption,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface TrendResponse {
  items: TrendItem[];
}

interface RecentResponse {
  items: RecentDocument[];
}

interface LowStockResponse {
  items: LowStockItem[];
}

const DOC_META: Record<
  RecentDocument["type"],
  { label: string; path: string; icon: LucideIcon; tone: string; bg: string }
> = {
  INBOUND: {
    label: "入库",
    path: "/inbound-orders",
    icon: ArrowDownToLine,
    tone: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  OUTBOUND: {
    label: "出库",
    path: "/outbound-orders",
    icon: ArrowUpFromLine,
    tone: "text-blue-600",
    bg: "bg-blue-50",
  },
  TRANSFER: {
    label: "调拨",
    path: "/transfer-orders",
    icon: ArrowRight,
    tone: "text-violet-600",
    bg: "bg-violet-50",
  },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  loading,
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone: string;
  loading?: boolean;
  to?: string;
}) {
  const content = (
    <Card className={cn("group relative overflow-hidden p-4 transition-shadow", to && "hover:shadow-popover")}>
      <div className="flex items-start justify-between">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </div>
        {to ? (
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/35 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        ) : null}
      </div>
      <p className="mt-4 text-[11px] font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1.5 h-8 w-24" />
      ) : (
        <p className="stat-number mt-0.5 text-[24px] font-semibold leading-8">{value}</p>
      )}
      <p className="mt-0.5 h-4 text-[11px] text-muted-foreground/80">{hint}</p>
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function TrendChart({ items, loading }: { items: TrendItem[]; loading: boolean }) {
  const max = useMemo(
    () => Math.max(1, ...items.flatMap((item) => [item.inbound_qty, item.outbound_qty])),
    [items],
  );
  const labelStep = items.length > 14 ? 7 : items.length > 8 ? 3 : 1;
  const hasActivity = items.some((item) => item.inbound_qty > 0 || item.outbound_qty > 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-2 pt-4">
        <div>
          <h3 className="text-[14px] font-semibold">库存流动趋势</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">最近 7 天入库与出库数量</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-primary" />
            入库
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-slate-300" />
            出库
          </span>
        </div>
      </div>
      <div className="px-5 pb-4 pt-2">
        {loading ? (
          <Skeleton className="h-[148px] w-full rounded-lg" />
        ) : items.length === 0 || !hasActivity ? (
          <div className="flex h-[148px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-black/[0.08] bg-slate-50/40 text-muted-foreground">
            <TrendingUp className="h-5 w-5 text-slate-300" strokeWidth={1.5} />
            <p className="text-[12px]">近期还没有出入库记录</p>
            <p className="text-[11px] text-muted-foreground/70">确认第一张入库单后，这里会出现趋势</p>
          </div>
        ) : (
          <div className="flex h-[148px] items-end gap-2 overflow-x-auto pb-1 no-scrollbar">
            {items.map((item, index) => (
              <div
                key={item.date}
                className="group flex min-w-[22px] flex-1 flex-col items-center justify-end gap-1.5"
                title={`${item.date} 入库 ${qty(item.inbound_qty)} / 出库 ${qty(item.outbound_qty)}`}
              >
                <div className="flex h-[112px] w-full items-end justify-center gap-[3px]">
                  <div
                    className="w-full max-w-[9px] rounded-t-[3px] bg-primary/85 transition-colors group-hover:bg-primary"
                    style={{ height: `${Math.max(2, (item.inbound_qty / max) * 100)}%` }}
                  />
                  <div
                    className="w-full max-w-[9px] rounded-t-[3px] bg-slate-300 transition-colors group-hover:bg-slate-400"
                    style={{ height: `${Math.max(2, (item.outbound_qty / max) * 100)}%` }}
                  />
                </div>
                <span className="h-3 whitespace-nowrap text-[9px] tabular text-muted-foreground/70">
                  {index % labelStep === 0 || index === items.length - 1
                    ? item.date.slice(5).replace("-", "/")
                    : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function LowStockList({
  items,
  loading,
  onMore,
}: {
  items: LowStockItem[];
  loading: boolean;
  onMore: () => void;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between px-5 pb-2 pt-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold">
            低库存提醒
            {items.length > 0 ? (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                {items.length}
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">已低于安全库存的商品</p>
        </div>
      </div>
      <div className="flex-1 px-2 pb-2">
        {loading ? (
          <div className="space-y-2 px-3 py-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-4 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50">
              <Package className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-[12px] font-medium">库存水平健康</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">暂时没有低于安全库存的商品</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.045]">
            {items.map((item) => {
              const ratio = item.safety_stock
                ? Math.min(100, Math.round((item.quantity / item.safety_stock) * 100))
                : 0;
              return (
                <Link
                  key={`${item.product_id}-${item.warehouse_id}`}
                  to={`/inventory?low_stock=1&q=${encodeURIComponent(item.sku)}`}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#FAFAFC]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">{item.product_name}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {item.sku} · {item.warehouse_name}
                    </p>
                    <div className="mt-1.5 h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          ratio <= 30 ? "bg-red-400" : ratio <= 70 ? "bg-amber-400" : "bg-emerald-400",
                        )}
                        style={{ width: `${Math.max(4, ratio)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-semibold tabular text-amber-700">{qty(item.quantity)}</p>
                    <p className="text-[9px] text-muted-foreground">安全 {qty(item.safety_stock)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {items.length > 0 ? (
        <button
          type="button"
          onClick={onMore}
          className="flex h-9 items-center justify-center gap-1 border-t border-black/[0.05] text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[#FAFAFC] hover:text-foreground"
        >
          查看全部低库存
          <ArrowRight className="h-3 w-3" />
        </button>
      ) : null}
    </Card>
  );
}

function RecentDocuments({
  items,
  loading,
  navigate,
}: {
  items: RecentDocument[];
  loading: boolean;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <div>
          <h3 className="text-[14px] font-semibold">最近单据</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">最近创建或更新的出入库、调拨单</p>
        </div>
        <Button variant="ghost" size="sm" className="text-[11px]" onClick={() => navigate("/reports")}>
          数据报表
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileClock}
          title="还没有业务单据"
          description="创建第一张入库单，库存流水会从这里开始。"
          compact
        />
      ) : (
        <div className="divide-y divide-black/[0.045] px-2 pb-1">
          {items.map((item) => {
            const meta = DOC_META[item.type];
            const Icon = meta.icon;
            return (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                onClick={() => navigate(`${meta.path}/${item.id}`)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#FAFAFC]"
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.bg)}>
                  <Icon className={cn("h-4 w-4", meta.tone)} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[12px] font-medium">{item.no}</p>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {meta.label} · {item.warehouse_name} · {relative(item.created_at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] font-medium tabular">{qty(item.quantity)}</p>
                  <p className="text-[9px] text-muted-foreground">件</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function DashboardPage() {
  useDocumentTitle("工作台");
  const { user, canWriteDocs } = useAuth();
  const navigate = useNavigate();
  const [warehouseId, setWarehouseId] = useState("");
  const warehouseParams = warehouseId ? { warehouse_id: warehouseId } : undefined;

  const summaryQuery = useApi<DashboardSummary>("/dashboard/summary", warehouseParams);
  const trendQuery = useApi<TrendResponse>("/dashboard/trend", {
    days: 7,
    ...warehouseParams,
  });
  const recentQuery = useApi<RecentResponse>("/dashboard/recent-documents", { limit: 5 });
  const lowQuery = useApi<LowStockResponse>("/dashboard/low-stock", {
    limit: 5,
    ...warehouseParams,
  });
  const warehouseQuery = useApi<{ items: WarehouseOption[] }>("/warehouses/options");

  const summary = summaryQuery.data;
  const lowItems = lowQuery.data?.items ?? [];

  return (
    <div>
      <PageHeader
        eyebrow={longDate()}
        title={`${greeting()}，${user?.display_name || "管理员"}`}
        description="这是仓库的最新情况，优先关注低库存和待处理草稿。"
        actions={
          <>
            <Select
              value={warehouseId || "all"}
              onValueChange={(value) => setWarehouseId(value === "all" ? "" : value)}
              options={[
                { value: "all", label: "全部仓库" },
                ...(warehouseQuery.data?.items ?? []).map((item) => ({
                  value: String(item.id),
                  label: item.name,
                })),
              ]}
              className="h-9 w-[150px]"
            />
            {canWriteDocs ? (
              <Button onClick={() => navigate("/inbound-orders/new")}>
                <Plus className="h-4 w-4" />
                新建入库
              </Button>
            ) : null}
          </>
        }
      />

      {user?.must_change_password ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-amber-900">你仍在使用初始密码</p>
            <p className="mt-0.5 text-[11px] text-amber-700/80">
              为了账号安全，建议现在修改为只有你知道的密码。
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate("/system/info")}>
            前往账户设置
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Package}
          label="库存总量"
          value={qty(summary?.total_quantity ?? 0)}
          hint={`${summary?.product_count ?? 0} 个商品 · ${summary?.warehouse_count ?? 0} 个仓库`}
          tone="bg-blue-50 text-blue-600"
          loading={summaryQuery.loading}
          to="/inventory"
        />
        <KpiCard
          icon={Wallet}
          label="库存总值"
          value={money(summary?.total_value ?? 0)}
          hint="按移动加权平均成本计算"
          tone="bg-emerald-50 text-emerald-600"
          loading={summaryQuery.loading}
          to="/reports"
        />
        <KpiCard
          icon={AlertTriangle}
          label="低库存商品"
          value={`${summary?.low_stock_count ?? 0}`}
          hint="低于安全库存，建议补货"
          tone="bg-amber-50 text-amber-600"
          loading={summaryQuery.loading}
          to="/inventory?low_stock=1"
        />
        <KpiCard
          icon={ClipboardList}
          label="待处理草稿"
          value={`${summary?.draft_documents ?? 0}`}
          hint={`今日入库 ${summary?.today_inbound ?? 0} · 出库 ${summary?.today_outbound ?? 0}`}
          tone="bg-violet-50 text-violet-600"
          loading={summaryQuery.loading}
        />
      </div>

      {summaryQuery.error ? (
        <div className="mt-4 rounded-xl border border-red-100 bg-white">
          <ErrorState message={summaryQuery.error} onRetry={summaryQuery.reload} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <TrendChart items={trendQuery.data?.items ?? []} loading={trendQuery.loading} />
          <RecentDocuments
            items={recentQuery.data?.items ?? []}
            loading={recentQuery.loading}
            navigate={navigate}
          />
        </div>
        <div className="space-y-4">
          <LowStockList
            items={lowItems}
            loading={lowQuery.loading}
            onMore={() => navigate("/reports?tab=low-stock")}
          />

          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold">快捷操作</h3>
                <p className="text-[10px] text-muted-foreground">常用工作一步直达</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate("/inbound-orders/new")}
                disabled={!canWriteDocs}
                className="flex items-center gap-2 rounded-lg border border-black/[0.055] bg-[#FAFAFC] px-2.5 py-2.5 text-left text-[11px] font-medium transition-colors hover:bg-white hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
              >
                <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />
                新建入库
              </button>
              <button
                type="button"
                onClick={() => navigate("/outbound-orders/new")}
                disabled={!canWriteDocs}
                className="flex items-center gap-2 rounded-lg border border-black/[0.055] bg-[#FAFAFC] px-2.5 py-2.5 text-left text-[11px] font-medium transition-colors hover:bg-white hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
              >
                <ArrowUpFromLine className="h-3.5 w-3.5 text-blue-600" />
                新建出库
              </button>
              <button
                type="button"
                onClick={() => navigate("/stocktakes")}
                disabled={!canWriteDocs}
                className="flex items-center gap-2 rounded-lg border border-black/[0.055] bg-[#FAFAFC] px-2.5 py-2.5 text-left text-[11px] font-medium transition-colors hover:bg-white hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
              >
                <ClipboardCheck className="h-3.5 w-3.5 text-amber-600" />
                库存盘点
              </button>
              <button
                type="button"
                onClick={() => navigate("/reports")}
                className="flex items-center gap-2 rounded-lg border border-black/[0.055] bg-[#FAFAFC] px-2.5 py-2.5 text-left text-[11px] font-medium transition-colors hover:bg-white hover:shadow-sm"
              >
                <FileBarChart className="h-3.5 w-3.5 text-violet-600" />
                查看报表
              </button>
            </div>
            {!canWriteDocs ? (
              <p className="mt-2.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Warehouse className="h-3 w-3" />
                只读账号可查看数据，不能创建单据。
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
