import { useState } from "react";
import { Activity, Clock3, Database, Globe2, RefreshCw, Server, Users } from "lucide-react";
import { useApi, useDocumentTitle } from "@/hooks/use-api";
import type { SystemInfo } from "@/lib/types";
import { formatUptime } from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export function SystemInfoPage() {
  useDocumentTitle("系统信息");
  const info = useApi<SystemInfo>("/system/info");
  const [checkedAt, setCheckedAt] = useState(() => new Date());

  const refresh = () => {
    info.reload();
    setCheckedAt(new Date());
  };

  return (
    <div>
      <PageHeader
        title="系统信息"
        description="当前服务版本、运行环境与基础统计。部署与备份说明请参阅项目文档。"
        actions={<Button variant="secondary" size="sm" onClick={refresh} disabled={info.loading}><RefreshCw className="h-3.5 w-3.5" />刷新</Button>}
      />

      {info.loading ? <TableSkeleton columns={3} /> : info.error || !info.data ? (
        <div className="app-card"><ErrorState message={info.error || "无法读取系统信息"} onRetry={info.reload} /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <InfoTile icon={Server} label="应用" value={info.data.name} hint={`版本 ${info.data.version}`} />
            <InfoTile icon={Activity} label="运行状态" value="运行中" hint={`已运行 ${formatUptime(info.data.uptime_seconds)}`} tone="green" />
            <InfoTile icon={Clock3} label="业务时区" value={info.data.timezone} hint="单据日期与报表按此时区计算" />
            <InfoTile icon={Database} label="数据库" value={info.data.database === "sqlite" ? "SQLite (WAL)" : info.data.database} hint="单文件数据库，已启用外键与完整同步" />
            <InfoTile icon={Users} label="系统用户" value={String(info.data.user_count)} hint="包含启用与停用账号" />
            <InfoTile icon={Globe2} label="接口前缀" value="/api/v1" hint="前端通过同源 Cookie 会话访问" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="app-card p-5">
              <h2 className="text-[14px] font-semibold">运行说明</h2>
              <div className="mt-3 space-y-3 text-[12px] leading-6 text-muted-foreground">
                <p>系统为单体应用：FastAPI 提供 API 并托管前端静态文件，SQLite 保存业务数据。库存确认在事务内完成，失败会整单回滚。</p>
                <p>默认只启动一个应用 worker，以保证 SQLite 写入安全。如访问量增加，优先优化查询与索引，而不是增加 worker。</p>
                <p>生产环境请通过 <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">/api/docs</code> 关闭状态确认接口文档是否暴露，并定期备份数据卷。</p>
              </div>
            </section>

            <section className="app-card p-5">
              <h2 className="text-[14px] font-semibold">安全建议</h2>
              <ul className="mt-3 space-y-2 text-[12px] leading-5 text-muted-foreground">
                <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" />首次登录后立即修改默认管理员密码。</li>
                <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" />为不同职责创建独立账号，不要共用管理员账号。</li>
                <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" />生产部署启用 HTTPS，并将 Cookie Secure 设置为开启。</li>
                <li className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" />定期备份数据文件；备份包含库存与审计记录，请妥善保管。</li>
              </ul>
            </section>
          </div>

          <div className="mt-4 rounded-xl border border-black/[0.06] bg-white/50 px-4 py-3 text-[11px] text-muted-foreground">
            最后刷新：{checkedAt.toLocaleTimeString("zh-CN", { hour12: false })} · 健康检查接口：<code className="font-mono">/api/v1/system/health</code>
          </div>
        </>
      )}
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  hint: string;
  tone?: "green";
}) {
  return (
    <div className="app-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-secondary text-slate-500"}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="field-label">{label}</p>
      </div>
      <p className="mt-2 truncate text-[16px] font-semibold tracking-[-0.01em]">{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
}
