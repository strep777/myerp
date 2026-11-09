import { useState } from "react";
import { RefreshCw, ShieldCheck, X } from "lucide-react";
import { useApi, useDocumentTitle } from "@/hooks/use-api";
import type { AuditLog, Page } from "@/lib/types";
import { AUDIT_ACTION_LABELS, formatDateTime, todayLocal } from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { SelectionBar, TableCheckbox, useTableSelection } from "@/components/common/table-selection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const ACTIONS = ["LOGIN", "LOGIN_FAILED", "CREATE", "UPDATE", "DELETE", "CONFIRM", "CANCEL", "COMPLETE", "ADJUST", "PASSWORD_RESET", "USER_DISABLE"];

export function AuditLogsPage() {
  useDocumentTitle("审计日志");
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const logs = useApi<Page<AuditLog>>("/audit-logs", {
    q: q || undefined,
    action: action || undefined,
    entity_type: entityType || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    page_size: pageSize,
  });

  const items = logs.data?.items ?? [];
  const selection = useTableSelection(items, (item) => String(item.id));

  const hasFilters = Boolean(q || action || entityType || dateFrom || dateTo);

  return (
    <div>
      <PageHeader
        title="审计日志"
        description="记录登录、主数据变更、单据确认与库存调整等关键操作，用于追责与问题排查。"
      />

      <div className="app-card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="用户 / 单号 / 摘要" className="w-full sm:w-56" />
          <Select
            value={action || "ALL"}
            onValueChange={(value) => { setAction(value === "ALL" ? "" : value); setPage(1); }}
            options={[{ value: "ALL", label: "全部动作" }, ...ACTIONS.map((item) => ({ value: item, label: AUDIT_ACTION_LABELS[item] ?? item }))]}
            className="w-32"
          />
          <Input value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1); }} placeholder="对象类型" className="w-32" />
          <div className="flex items-center gap-1.5">
            <Input type="date" value={dateFrom} max={dateTo || todayLocal()} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="w-[136px]" aria-label="开始日期" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" value={dateTo} min={dateFrom} max={todayLocal()} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="w-[136px]" aria-label="结束日期" />
          </div>
          {hasFilters ? <Button variant="ghost" size="sm" onClick={() => { setQ(""); setAction(""); setEntityType(""); setDateFrom(""); setDateTo(""); setPage(1); }}><X className="h-3.5 w-3.5" />清除</Button> : null}
          <Button variant="ghost" size="sm" onClick={() => logs.reload()} disabled={logs.loading}><RefreshCw className="h-3.5 w-3.5" />刷新</Button>
        </div>
      </div>

      {items.length > 0 ? (
        <SelectionBar
          count={selection.selectedCount}
          total={items.length}
          allSelected={selection.allSelected}
          onToggleAll={selection.toggleAll}
          copyText={() =>
            selection.selectedRows
              .map((item) => `${formatDateTime(item.created_at)}\t${item.username || "系统"}\t${item.action}\t${item.entity_no}\t${item.summary}`)
              .join("\n")
          }
        />
      ) : null}

      <div className="app-card overflow-hidden">
        {logs.loading ? <TableSkeleton columns={7} /> : logs.error ? <ErrorState message={logs.error} onRetry={logs.reload} /> : !logs.data?.items.length ? (
          <EmptyState icon={ShieldCheck} title={hasFilters ? "没有匹配的日志" : "暂无审计日志"} description={hasFilters ? "调整筛选条件后重试。" : "关键操作发生后，日志会自动出现在这里。"} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[12px]">
                <thead className="border-b border-black/[0.06] bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-4 py-2.5 font-medium">
                      <TableCheckbox
                        checked={selection.allSelected}
                        indeterminate={selection.someSelected}
                        onChange={selection.toggleAll}
                        label="全选当前页日志"
                      />
                    </th>
                    <th className="px-4 py-2.5 font-medium">时间</th>
                    <th className="px-3 py-2.5 font-medium">用户</th>
                    <th className="px-3 py-2.5 font-medium">动作</th>
                    <th className="px-3 py-2.5 font-medium">对象</th>
                    <th className="px-4 py-2.5 font-medium">摘要</th>
                    <th className="px-3 py-2.5 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {logs.data.items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="w-10 px-4 py-2.5 pr-0">
                        <TableCheckbox
                          checked={selection.selected.has(String(item.id))}
                          onChange={(checked) => selection.toggle(String(item.id), checked)}
                          label={`选择日志 ${item.id}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[11px] text-muted-foreground">{formatDateTime(item.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{item.username || "系统"}</p>
                        {item.user_id ? <p className="text-[10px] text-muted-foreground">ID {item.user_id}</p> : null}
                      </td>
                      <td className="px-3 py-2.5"><ActionBadge action={item.action} /></td>
                      <td className="px-3 py-2.5">
                        <p className="text-[11px]">{item.entity_type || "—"}</p>
                        {item.entity_no ? <p className="font-mono text-[10px] text-muted-foreground">{item.entity_no}</p> : null}
                      </td>
                      <td className="max-w-[360px] px-4 py-2.5">
                        <p className="text-[11px] leading-5">{item.summary || "—"}</p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground">{item.ip || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={logs.data.page} pageSize={logs.data.page_size} total={logs.data.total} pages={logs.data.pages} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const label = AUDIT_ACTION_LABELS[action] ?? action;
  const destructive = action === "DELETE" || action === "LOGIN_FAILED" || action === "USER_DISABLE";
  const success = action === "LOGIN" || action === "CONFIRM" || action === "COMPLETE";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${destructive ? "bg-rose-50 text-rose-700 ring-rose-200/70" : success ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70" : "bg-slate-50 text-slate-600 ring-slate-200/70"}`}>
      {label}
    </span>
  );
}
