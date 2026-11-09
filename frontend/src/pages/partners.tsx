import { useEffect, useState, type FormEvent } from "react";
import { Building2, Mail, Pencil, Phone, Plus, Trash2, Truck, Users } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { useApi, useDebouncedValue, useDocumentTitle } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import type { Page, Partner } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { BulkDeleteDialog } from "@/components/common/bulk-delete-dialog";
import { SelectionBar, TableCheckbox, useTableSelection } from "@/components/common/table-selection";
import { FormField, FormGrid } from "@/components/common/form";
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

type PartnerKind = "supplier" | "customer";

interface PartnerForm {
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  remark: string;
  is_active: string;
}

const EMPTY_FORM: PartnerForm = {
  code: "",
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  remark: "",
  is_active: "true",
};

const META = {
  supplier: {
    title: "供应商",
    singular: "供应商",
    description: "维护入库单中可选的供应商档案与联系人信息。",
    api: "/suppliers",
    icon: Truck,
    color: "bg-emerald-50 text-emerald-600",
  },
  customer: {
    title: "客户",
    singular: "客户",
    description: "维护出库单中可选的客户档案与收货联系人信息。",
    api: "/customers",
    icon: Users,
    color: "bg-violet-50 text-violet-600",
  },
} as const;

function PartnerDialog({
  kind,
  open,
  onOpenChange,
  partner,
  onSaved,
}: {
  kind: PartnerKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner: Partner | null;
  onSaved: () => void;
}) {
  const meta = META[kind];
  const [form, setForm] = useState<PartnerForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        partner
          ? {
              code: partner.code,
              name: partner.name,
              contact_person: partner.contact_person,
              phone: partner.phone,
              email: partner.email,
              address: partner.address,
              remark: partner.remark,
              is_active: partner.is_active ? "true" : "false",
            }
          : EMPTY_FORM,
      );
      setErrors({});
      setError(null);
    }
  }, [open, partner]);

  const set = (key: keyof PartnerForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.code.trim()) nextErrors.code = "请输入编码";
    if (!form.name.trim()) nextErrors.name = "请输入名称";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "请输入有效的邮箱地址";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    setError(null);
    setErrors({});
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        contact_person: form.contact_person.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        remark: form.remark.trim(),
        is_active: form.is_active === "true",
      };
      if (partner) {
        await api.patch<Partner>(`${meta.api}/${partner.id}`, payload);
        toast.success(`${meta.singular}资料已更新`);
      } else {
        await api.post<Partner>(meta.api, payload);
        toast.success(`${meta.singular}已创建`);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields || {});
        setError(err.message);
      } else {
        setError("保存失败，请稍后重试");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{partner ? `编辑${meta.singular}` : `新建${meta.singular}`}</DialogTitle>
            <DialogDescription>
              {kind === "supplier"
                ? "供应商会出现在入库单的选择列表中。"
                : "客户会出现在出库单的选择列表中。"}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="py-2">
            <FormGrid>
              <FormField label="编码" htmlFor="partner-code" required error={errors.code}>
                <Input
                  id="partner-code"
                  value={form.code}
                  onChange={(event) => set("code", event.target.value)}
                  placeholder={kind === "supplier" ? "例如 SUP-001" : "例如 CUS-001"}
                  autoFocus
                />
              </FormField>
              <FormField label="名称" htmlFor="partner-name" required error={errors.name}>
                <Input
                  id="partner-name"
                  value={form.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="公司或个人名称"
                />
              </FormField>
              <FormField label="联系人" htmlFor="partner-contact" error={errors.contact_person}>
                <Input
                  id="partner-contact"
                  value={form.contact_person}
                  onChange={(event) => set("contact_person", event.target.value)}
                  placeholder="联系人姓名"
                />
              </FormField>
              <FormField label="电话" htmlFor="partner-phone" error={errors.phone}>
                <Input
                  id="partner-phone"
                  value={form.phone}
                  onChange={(event) => set("phone", event.target.value)}
                  placeholder="手机或座机"
                />
              </FormField>
              <FormField label="邮箱" htmlFor="partner-email" error={errors.email}>
                <Input
                  id="partner-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => set("email", event.target.value)}
                  placeholder="选填"
                />
              </FormField>
              <FormField label="状态" htmlFor="partner-active" error={errors.is_active}>
                <Select
                  id="partner-active"
                  value={form.is_active}
                  onValueChange={(value) => set("is_active", value)}
                  options={[
                    { value: "true", label: "启用" },
                    { value: "false", label: "停用" },
                  ]}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="地址" htmlFor="partner-address" error={errors.address}>
                  <Input
                    id="partner-address"
                    value={form.address}
                    onChange={(event) => set("address", event.target.value)}
                    placeholder="选填，用于收货或开单"
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="备注" htmlFor="partner-remark" error={errors.remark}>
                  <Textarea
                    id="partner-remark"
                    value={form.remark}
                    onChange={(event) => set("remark", event.target.value)}
                    placeholder="选填"
                    rows={2}
                  />
                </FormField>
              </div>
            </FormGrid>
            {error ? (
              <p className="mt-4 rounded-lg bg-destructive/[0.06] px-3 py-2 text-[12px] text-destructive">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button type="submit" loading={saving}>
              {partner ? "保存修改" : `创建${meta.singular}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PartnersPage({ kind }: { kind: PartnerKind }) {
  const meta = META[kind];
  const Icon = meta.icon;
  useDocumentTitle(meta.title);
  const { canManageMaster } = useAuth();
  const [q, setQ] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const debouncedQ = useDebouncedValue(q);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState<Partner | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  useEffect(() => setPage(1), [debouncedQ, active]);

  const query = useApi<Page<Partner>>(meta.api, {
    q: debouncedQ,
    is_active: active === "all" ? undefined : active,
    page,
    page_size: pageSize,
  });

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`${meta.api}/${deleting.id}`);
      toast.success(`${meta.singular}已删除`);
      setDeleting(null);
      query.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "删除失败，请稍后重试");
    } finally {
      setDeleteLoading(false);
    }
  };

  const items = query.data?.items ?? [];
  const selection = useTableSelection(items, (item) => String(item.id));

  return (
    <div>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          canManageMaster ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              新建{meta.singular}
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={`搜索${meta.singular}名称、编码或联系人`}
          className="w-full sm:max-w-[320px]"
        />
        <Select
          value={active}
          onValueChange={setActive}
          options={[
            { value: "all", label: "全部状态" },
            { value: "true", label: "启用" },
            { value: "false", label: "停用" },
          ]}
          className="h-9 sm:w-[130px]"
        />
        <p className="text-[11px] text-muted-foreground sm:ml-auto">
          {query.data ? `共 ${query.data.total} 个${meta.singular}` : "正在加载…"}
        </p>
      </div>

      {query.loading ? (
        <TableSkeleton columns={6} />
      ) : query.error ? (
        <div className="app-card">
          <ErrorState message={query.error} onRetry={query.reload} />
        </div>
      ) : items.length === 0 ? (
        <div className="app-card">
          <EmptyState
            icon={Icon}
            title={q || active !== "all" ? `没有匹配的${meta.singular}` : `还没有${meta.singular}`}
            description={
              q || active !== "all"
                ? "试试调整搜索词或状态筛选。"
                : `创建${meta.singular}后，在做单时可以直接选择。`
            }
            actionLabel={canManageMaster ? `新建第一个${meta.singular}` : undefined}
            onAction={
              canManageMaster
                ? () => {
                    setEditing(null);
                    setDialogOpen(true);
                  }
                : undefined
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
            onDelete={canManageMaster ? () => setBulkDeleteOpen(true) : undefined}
            copyText={() =>
              selection.selectedRows
                .map((item) => `${item.code}\t${item.name}\t${item.contact_person}\t${item.phone}`)
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
                  <th>联系人</th>
                  <th>联系方式</th>
                  <th>地址</th>
                  <th>状态</th>
                  <th className="w-[100px] text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((partner) => (
                  <tr key={partner.id}>
                    <td className="w-10 pr-0">
                      <TableCheckbox
                        checked={selection.selected.has(String(partner.id))}
                        onChange={(checked) => selection.toggle(String(partner.id), checked)}
                        label={`选择 ${partner.name}`}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.color}`}>
                          <Icon className="h-4 w-4" strokeWidth={1.7} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{partner.name}</p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {partner.code}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="text-[12px] text-muted-foreground">{partner.contact_person || "—"}</td>
                    <td>
                      <div className="space-y-0.5 text-[11px] text-muted-foreground">
                        {partner.phone ? (
                          <p className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {partner.phone}
                          </p>
                        ) : null}
                        {partner.email ? (
                          <p className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {partner.email}
                          </p>
                        ) : null}
                        {!partner.phone && !partner.email ? "—" : null}
                      </div>
                    </td>
                    <td className="max-w-[220px] truncate text-[12px] text-muted-foreground">
                      {partner.address || "—"}
                    </td>
                    <td>
                      <Badge variant={partner.is_active ? "success" : "muted"}>
                        {partner.is_active ? "启用" : "停用"}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setEditing(partner);
                            setDialogOpen(true);
                          }}
                          aria-label={`编辑 ${partner.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canManageMaster ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleting(partner)}
                            aria-label={`删除 ${partner.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
            total={query.data?.total ?? 0}
            page={query.data?.page ?? page}
            pageSize={pageSize}
            pages={query.data?.pages ?? 1}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      <PartnerDialog
        kind={kind}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        partner={editing}
        onSaved={query.reload}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={`删除${meta.singular}`}
        description={
          deleting
            ? `确定要删除「${deleting.name}」吗？已被单据引用的${meta.singular}不能删除，请改为停用。`
            : ""
        }
        confirmLabel="删除"
        destructive
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        rows={selection.selectedRows}
        entityLabel={meta.singular}
        getPath={(partner) => `${meta.api}/${partner.id}`}
        getLabel={(partner) => `${partner.code} ${partner.name}`}
        description={`将永久删除选中的${meta.singular}。已被入库、出库或调拨单引用的记录会保留，并说明原因；也可以改为停用。`}
        onDone={() => {
          query.reload();
          selection.clear();
        }}
      />
    </div>
  );
}
