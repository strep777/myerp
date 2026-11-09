import { useState, type ComponentType } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Pencil,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { useApi, useDocumentTitle } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import type { AnyOrder, OrderType } from "./order-meta";
import type { InboundOrder } from "@/lib/types";
import { ORDER_META } from "./order-meta";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";

type Action = "confirm" | "cancel" | "delete" | null;

function InfoCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="app-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        <p className="field-label">{label}</p>
      </div>
      <p className="mt-1.5 truncate text-[15px] font-semibold tracking-[-0.01em]">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function OrderDetailPage({ type }: { type: OrderType }) {
  const meta = ORDER_META[type];
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canWriteDocs } = useAuth();
  const order = useApi<AnyOrder>(id ? `${meta.api}/${id}` : null);
  const [action, setAction] = useState<Action>(null);

  useDocumentTitle(order.data ? `${order.data.order_no} · ${meta.singular}` : meta.singular);

  const runAction = async () => {
    if (!action || !id) return;
    try {
      if (action === "delete") {
        await api.delete(`${meta.api}/${id}`);
        toast.success(`${meta.singular}已删除`);
        navigate(meta.path);
        return;
      }
      await api.post<AnyOrder>(`${meta.api}/${id}/${action}`);
      toast.success(action === "confirm" ? `${meta.singular}已确认，库存已更新` : `${meta.singular}已取消`);
      setAction(null);
      order.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作失败，请稍后重试");
    }
  };

  if (order.loading) {
    return (
      <div>
        <PageHeader title={meta.singular} back={meta.path} />
        <TableSkeleton columns={4} />
      </div>
    );
  }

  if (order.error || !order.data) {
    return (
      <div>
        <PageHeader title={meta.singular} back={meta.path} />
        <div className="app-card">
          <ErrorState message={order.error || "未找到该单据"} onRetry={order.reload} />
        </div>
      </div>
    );
  }

  const data = order.data;
  const isTransfer = "from_warehouse_id" in data;
  const isInbound = "supplier_id" in data;
  const isOutbound = "customer_id" in data;
  const inbound = isInbound ? (data as InboundOrder) : null;
  const lines = data.lines;
  const warehouseName = isTransfer ? `${data.from_warehouse_name} → ${data.to_warehouse_name}` : data.warehouse_name;
  const partnerName = isInbound
    ? (data as InboundOrder).supplier_name || "未指定供应商"
    : isOutbound
      ? (data as { customer_name?: string | null }).customer_name || "未指定客户"
      : "—";
  const canEdit = data.status === "DRAFT" && canWriteDocs;

  return (
    <div>
      <PageHeader
        title={data.order_no}
        eyebrow={meta.singular}
        description={`创建于 ${formatDateTime(data.created_at)}${data.created_by_name ? ` · ${data.created_by_name}` : ""}`}
        back={meta.path}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            {canEdit ? (
              <>
                <Button variant="secondary" asChild>
                  <Link to={`${meta.path}/${data.id}/edit`}>
                    <Pencil className="h-4 w-4" />
                    编辑
                  </Link>
                </Button>
                <Button onClick={() => setAction("confirm")}>
                  <Check className="h-4 w-4" />
                  确认单据
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      {data.status === "CONFIRMED" ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-[12px] text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>该单据已确认，库存已按明细更新。确认后不可编辑；如需冲销，请使用反向单据或库存调整，并保留说明。</p>
        </div>
      ) : data.status === "CANCELLED" ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-600">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>该单据已取消，不会影响库存。已取消的单据会保留用于审计追溯。</p>
        </div>
      ) : (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-[12px] text-amber-800">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>这是草稿，尚未影响库存。请仔细核对明细和仓库后确认；确认后状态将变为已确认且不可再编辑。</p>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <InfoCard
          label={isTransfer ? "调拨路径" : "仓库"}
          value={warehouseName}
          hint={isTransfer ? "调出仓库 → 调入仓库" : "库存归属仓库"}
          icon={ArrowLeftRight}
        />
        {!isTransfer ? (
          <InfoCard
            label={isInbound ? "供应商" : "客户"}
            value={partnerName}
            hint={isInbound ? "货物来源" : "货物去向"}
            icon={UserRound}
          />
        ) : (
          <InfoCard label="调拨数量" value={`${formatQty(data.total_quantity)} 件`} hint="两仓同时增减" icon={ArrowLeftRight} />
        )}
        <InfoCard
          label="总数量"
          value={`${formatQty(data.total_quantity)} 件`}
          hint={`${lines.length} 行商品明细`}
          icon={FileText}
        />
        {isInbound && inbound ? (
          <InfoCard label="总金额" value={formatMoney(inbound.total_amount)} hint="按行数量 × 单位成本" icon={FileText} />
        ) : (
          <InfoCard
            label="预计日期"
            value={"expected_date" in data && data.expected_date ? formatDate(data.expected_date) : "未指定"}
            hint="草稿参考日期"
            icon={CalendarDays}
          />
        )}
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold">商品明细</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">确认前请逐行核对商品、数量与成本。</p>
          </div>
          <span className="text-[11px] text-muted-foreground">{lines.length} 行</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">商品</th>
                <th className="px-3 py-2.5 text-right font-medium">数量</th>
                <th className="px-3 py-2.5 font-medium">单位</th>
                {isInbound ? (
                  <>
                    <th className="px-3 py-2.5 text-right font-medium">单位成本</th>
                    <th className="px-3 py-2.5 text-right font-medium">金额</th>
                  </>
                ) : null}
                <th className="px-4 py-2.5 font-medium">行备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {lines.map((line) => {
                const amount = "unit_cost" in line ? Number(line.quantity) * Number(line.unit_cost) : null;
                return (
                  <tr key={line.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{line.product_name}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase text-muted-foreground">{line.sku}</p>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular">{formatQty(line.quantity)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{line.unit}</td>
                    {isInbound && "unit_cost" in line ? (
                      <>
                        <td className="px-3 py-3 text-right text-muted-foreground tabular">{formatMoney(line.unit_cost)}</td>
                        <td className="px-3 py-3 text-right font-medium tabular">
                          {amount === null ? "—" : formatMoney(amount)}
                        </td>
                      </>
                    ) : null}
                    <td className="max-w-[220px] truncate px-4 py-3 text-[11px] text-muted-foreground">
                      {line.remark || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {isInbound && inbound ? (
              <tfoot className="border-t border-black/[0.06] bg-secondary/30">
                <tr>
                  <td className="px-4 py-2.5 text-[11px] text-muted-foreground" colSpan={3}>
                    合计
                  </td>
                  <td className="px-3 py-2.5 text-right text-[11px] text-muted-foreground">—</td>
                  <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular">{formatMoney(inbound.total_amount)}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="app-card p-4">
          <h3 className="text-[12px] font-semibold">单据信息</h3>
          <dl className="mt-3 space-y-2 text-[12px]">
            {!isTransfer ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">关联单号</dt>
                <dd className="text-right font-medium">
                  {"related_no" in data ? data.related_no || "—" : "—"}
                </dd>
              </div>
            ) : null}
            {!isTransfer ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">预计日期</dt>
                <dd className="text-right">{"expected_date" in data ? formatDate(data.expected_date) : "—"}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">创建人</dt>
              <dd className="text-right">{data.created_by_name || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">确认人</dt>
              <dd className="text-right">{data.confirmed_by_name || "尚未确认"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">确认时间</dt>
              <dd className="text-right">{data.confirmed_at ? formatDateTime(data.confirmed_at) : "—"}</dd>
            </div>
          </dl>
        </div>
        <div className="app-card p-4">
          <h3 className="text-[12px] font-semibold">备注</h3>
          <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-muted-foreground">{data.remark || "无备注"}</p>
          {canEdit ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-black/[0.06] pt-3">
              <Button variant="secondary" size="sm" onClick={() => setAction("cancel")}>
                <XCircle className="h-3.5 w-3.5" />
                取消单据
              </Button>
              <Button variant="destructive-ghost" size="sm" onClick={() => setAction("delete")}>
                <Trash2 className="h-3.5 w-3.5" />
                删除草稿
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to={meta.path}>
            <ArrowLeft className="h-3.5 w-3.5" />
            返回{meta.title}列表
          </Link>
        </Button>
        <p className="text-[10px] text-muted-foreground">单据编号由系统自动生成，全局唯一。</p>
      </div>

      <ConfirmDialog
        open={action === "confirm"}
        onOpenChange={(next) => !next && setAction(null)}
        title={`确认${meta.singular}`}
        description={
          isTransfer
            ? "确认后会立即从调出仓库扣减库存、向调入仓库增加库存。请确认两个仓库与明细无误。"
            : type === "inbound"
              ? "确认后会立即增加仓库库存，并按移动加权平均更新成本。确认后不可编辑。"
              : "确认后会立即扣减仓库库存。任何一行库存不足，整张单据都会确认失败。"
        }
        confirmLabel="确认并更新库存"
        onConfirm={runAction}
      >
        <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2 text-[12px]">
          <span className="text-muted-foreground">{warehouseName}</span>
          <span className="font-semibold tabular">{formatQty(data.total_quantity)} 件</span>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={action === "cancel"}
        onOpenChange={(next) => !next && setAction(null)}
        title={`取消${meta.singular}`}
        description="取消后不会影响库存；单据会保留在列表中，状态变为已取消。"
        confirmLabel="确认取消"
        destructive
        onConfirm={runAction}
      />

      <ConfirmDialog
        open={action === "delete"}
        onOpenChange={(next) => !next && setAction(null)}
        title={`删除${meta.singular}`}
        description="仅草稿可以删除。删除后无法恢复，单据编号不会再次使用。"
        confirmLabel="删除草稿"
        destructive
        onConfirm={runAction}
      />
    </div>
  );
}
