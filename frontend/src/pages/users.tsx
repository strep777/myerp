import { useState } from "react";
import { KeyRound, Plus, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { useApi, useDocumentTitle } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import type { Page, Role, User } from "@/lib/types";
import { formatDateTime, initials, ROLE_DESCRIPTIONS, ROLE_LABELS, roleLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { SelectionBar, TableCheckbox, useTableSelection } from "@/components/common/table-selection";
import { FormField, FormGrid } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((role) => ({ value: role, label: ROLE_LABELS[role] }));

export function UsersPage() {
  useDocumentTitle("用户管理");
  const { user: currentUser } = useAuth();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  const users = useApi<Page<User>>("/users", {
    q: q || undefined,
    role: role || undefined,
    is_active: active === "" ? undefined : active === "true",
    page,
    page_size: pageSize,
  });

  const items = users.data?.items ?? [];
  const selection = useTableSelection(items, (item) => String(item.id));

  const hasFilters = Boolean(q || role || active);

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="管理员可以创建账号、分配角色、停用账号或重置密码。密码重置后旧会话立即失效。"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />新建用户</Button>}
      />

      <div className="app-card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="用户名 / 姓名" className="w-full sm:w-56" />
          <Select
            value={role || "ALL"}
            onValueChange={(value) => { setRole(value === "ALL" ? "" : value); setPage(1); }}
            options={[{ value: "ALL", label: "全部角色" }, ...ROLE_OPTIONS]}
            className="w-32"
          />
          <Select
            value={active || "ALL"}
            onValueChange={(value) => { setActive(value === "ALL" ? "" : value); setPage(1); }}
            options={[{ value: "ALL", label: "全部状态" }, { value: "true", label: "已启用" }, { value: "false", label: "已停用" }]}
            className="w-28"
          />
          {hasFilters ? <Button variant="ghost" size="sm" onClick={() => { setQ(""); setRole(""); setActive(""); setPage(1); }}><X className="h-3.5 w-3.5" />清除</Button> : null}
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
              .map((item) => `${item.username}\t${item.display_name}\t${item.role}`)
              .join("\n")
          }
        />
      ) : null}

      <div className="app-card overflow-hidden">
        {users.loading ? <TableSkeleton columns={7} /> : users.error ? <ErrorState message={users.error} onRetry={users.reload} /> : !users.data?.items.length ? (
          <EmptyState icon={UserRound} title="没有找到用户" description="调整筛选条件，或创建一个新用户。" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-[12px]">
                <thead className="border-b border-black/[0.06] bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-4 py-2.5 font-medium">
                      <TableCheckbox
                        checked={selection.allSelected}
                        indeterminate={selection.someSelected}
                        onChange={selection.toggleAll}
                        label="全选当前页用户"
                      />
                    </th>
                    <th className="px-4 py-2.5 font-medium">用户</th>
                    <th className="px-3 py-2.5 font-medium">角色</th>
                    <th className="px-3 py-2.5 font-medium">状态</th>
                    <th className="px-3 py-2.5 font-medium">密码状态</th>
                    <th className="px-3 py-2.5 font-medium">创建时间</th>
                    <th className="px-4 py-2.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {users.data.items.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-secondary/30">
                      <td className="w-10 px-4 py-3 pr-0">
                        <TableCheckbox
                          checked={selection.selected.has(String(item.id))}
                          onChange={(checked) => selection.toggle(String(item.id), checked)}
                          label={`选择用户 ${item.username}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-slate-100 to-slate-200 text-[11px] font-semibold text-slate-600">
                            {initials(item.display_name || item.username)}
                          </span>
                          <div>
                            <p className="font-medium">
                              {item.display_name}
                              {item.id === currentUser?.id ? <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">你</span> : null}
                            </p>
                            <p className="font-mono text-[10px] text-muted-foreground">@{item.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", roleStyle(item.role))}>
                          {item.role === "ADMIN" ? <ShieldCheck className="h-3 w-3" /> : null}
                          {roleLabel(item.role)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex items-center gap-1.5 text-[11px]", item.is_active ? "text-emerald-700" : "text-slate-500")}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", item.is_active ? "bg-emerald-500" : "bg-slate-400")} />
                          {item.is_active ? "启用" : "停用"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-muted-foreground">
                        {item.must_change_password ? <span className="text-amber-700">需修改密码</span> : "正常"}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-muted-foreground">{formatDateTime(item.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>编辑</Button>
                          <Button variant="ghost" size="sm" onClick={() => setResetting(item)}><KeyRound className="h-3 w-3" />重置密码</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={users.data.page} pageSize={users.data.page_size} total={users.data.total} pages={users.data.pages} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      </div>

      <UserCreateDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={() => users.reload()} />
      <UserEditDialog user={editing} onOpenChange={(open) => !open && setEditing(null)} onSaved={() => { setEditing(null); users.reload(); }} />
      <ResetPasswordDialog user={resetting} onOpenChange={(open) => !open && setResetting(null)} onSaved={() => { setResetting(null); users.reload(); }} />
    </div>
  );
}

function UserCreateDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ username: "", display_name: "", password: "", role: "OPERATOR" as Role });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const reset = () => { setForm({ username: "", display_name: "", password: "", role: "OPERATOR" }); setErrors({}); };
  const submit = async () => {
    const next: Record<string, string> = {};
    if (!form.username.trim()) next.username = "请输入用户名";
    if (!form.display_name.trim()) next.display_name = "请输入姓名";
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) next.password = "至少 8 位，包含字母和数字";
    if (Object.keys(next).length) { setErrors(next); return; }
    setSaving(true);
    setErrors({});
    try {
      await api.post<User>("/users", { username: form.username.trim().toLowerCase(), display_name: form.display_name.trim(), password: form.password, role: form.role });
      toast.success("用户已创建");
      onOpenChange(false);
      reset();
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({ ...(err.fields ?? {}), form: err.fields ? "" : err.message });
      }
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) { onOpenChange(next); if (!next) reset(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>新建用户</DialogTitle><p className="text-[12px] text-muted-foreground">创建后请将用户名和初始密码安全地告知对方。</p></DialogHeader>
        <DialogBody className="space-y-4">
          <FormGrid>
            <FormField label="用户名" required error={errors.username} hint="登录账号，创建后不可修改">
              <Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="如 zhangsan" autoComplete="off" />
            </FormField>
            <FormField label="姓名" required error={errors.display_name}>
              <Input value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} placeholder="如 张三" />
            </FormField>
          </FormGrid>
          <FormField label="初始密码" required error={errors.password} hint="至少 8 位，包含字母和数字">
            <Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="设置初始密码" autoComplete="new-password" />
          </FormField>
          <FormField label="角色" required hint={ROLE_DESCRIPTIONS[form.role]}>
            <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value as Role })} options={ROLE_OPTIONS} />
          </FormField>
          {errors.form ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{errors.form}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={() => void submit()} loading={saving} disabled={saving}>创建用户</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserEditDialog({ user, onOpenChange, onSaved }: { user: User | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("OPERATOR");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState<number | null>(null);

  if (user && initialized !== user.id) {
    setInitialized(user.id);
    setDisplayName(user.display_name);
    setRole(user.role);
    setIsActive(user.is_active);
    setError("");
  }

  const submit = async () => {
    if (!user) return;
    if (!displayName.trim()) { setError("姓名不能为空"); return; }
    setSaving(true);
    setError("");
    try {
      await api.patch<User>(`/users/${user.id}`, { display_name: displayName.trim(), role, is_active: isActive });
      toast.success("用户已更新");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败，请稍后重试");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑用户</DialogTitle><p className="text-[12px] text-muted-foreground">@{user?.username}</p></DialogHeader>
        <DialogBody className="space-y-4">
          <FormField label="姓名" required><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></FormField>
          <FormField label="角色" hint={ROLE_DESCRIPTIONS[role]}><Select value={role} onValueChange={(value) => setRole(value as Role)} options={ROLE_OPTIONS} /></FormField>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-black/[0.06] bg-secondary/40 p-3">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#007AFF]" />
            <span><span className="block text-[12px] font-medium">启用账号</span><span className="mt-0.5 block text-[11px] text-muted-foreground">停用后该用户无法登录，已登录会话立即失效；历史操作记录保留。</span></span>
          </label>
          {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={() => void submit()} loading={saving} disabled={saving}>保存修改</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onOpenChange, onSaved }: { user: User | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const close = (next: boolean) => {
    if (!next) { setPassword(""); setError(""); }
    onOpenChange(next);
  };
  const submit = async () => {
    if (!user) return;
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { setError("至少 8 位，包含字母和数字"); return; }
    setSaving(true); setError("");
    try {
      await api.post(`/users/${user.id}/reset-password`, { new_password: password });
      toast.success(`已重置 ${user.display_name} 的密码，旧会话已失效`);
      setPassword("");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "重置失败，请稍后重试");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={close}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>重置密码</DialogTitle><p className="text-[12px] leading-5 text-muted-foreground">将重置 <strong>{user?.display_name}</strong> 的登录密码。对方的所有已登录会话会立即失效，下次登录后需修改密码。</p></DialogHeader>
        <DialogBody>
          <FormField label="新密码" required error={error} hint="至少 8 位，包含字母和数字">
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="输入新密码" />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => close(false)} disabled={saving}>取消</Button>
          <Button onClick={() => void submit()} loading={saving} disabled={saving}>确认重置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function roleStyle(role: Role) {
  if (role === "ADMIN") return "bg-violet-50 text-violet-700 ring-violet-200/70";
  if (role === "MANAGER") return "bg-blue-50 text-blue-700 ring-blue-200/70";
  if (role === "OPERATOR") return "bg-emerald-50 text-emerald-700 ring-emerald-200/70";
  return "bg-slate-50 text-slate-600 ring-slate-200/70";
}
