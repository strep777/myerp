import { useEffect, useState, type FormEvent } from "react";
import { MapPin, Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { useApi, useDebouncedValue, useDocumentTitle } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { formatQty } from "@/lib/format";
import type { Page, Warehouse } from "@/lib/types";
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

interface WarehouseForm {
  code: string;
  name: string;
  location: string;
  manager: string;
  remark: string;
  is_active: string;
}

const EMPTY_FORM: WarehouseForm = {
  code: "",
  name: "",
  location: "",
  manager: "",
  remark: "",
  is_active: "true",
};

function WarehouseDialog({
  open,
  onOpenChange,
  warehouse,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouse: Warehouse | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<WarehouseForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        warehouse
          ? {
              code: warehouse.code,
              name: warehouse.name,
              location: warehouse.location,
              manager: warehouse.manager,
              remark: warehouse.remark,
              is_active: warehouse.is_active ? "true" : "false",
            }
          : EMPTY_FORM,
      );
      setErrors({});
      setError(null);
    }
  }, [open, warehouse]);

  const set = (key: keyof WarehouseForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.code.trim()) nextErrors.code = "请输入仓库编码";
    if (!form.name.trim()) nextErrors.name = "请输入仓库名称";
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
        location: form.location.trim(),
        manager: form.manager.trim(),
        remark: form.remark.trim(),
        is_active: form.is_active === "true",
      };
      if (warehouse) {
        await api.patch<Warehouse>(`/warehouses/${warehouse.id}`, payload);
        toast.success("仓库已更新");
      } else {
        await api.post<Warehouse>("/warehouses", payload);
        toast.success("仓库已创建");
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
            <DialogTitle>{warehouse ? "编辑仓库" : "新建仓库"}</DialogTitle>
            <DialogDescription>仓库是库存与单据的归属维度，编码需保持唯一。</DialogDescription>
          </DialogHeader>
          <DialogBody className="py-2">
            <FormGrid>
              <FormField label="仓库编码" htmlFor="warehouse-code" required error={errors.code}>
                <Input
                  id="warehouse-code"
                  value={form.code}
                  onChange={(event) => set("code", event.target.value)}
                  placeholder="例如 SH"
                  autoFocus
                />
              </FormField>
              <FormField label="仓库名称" htmlFor="warehouse-name" required error={errors.name}>
                <Input
                  id="warehouse-name"
                  value={form.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="例如 上海主仓"
                />
              </FormField>
              <FormField label="所在地点" htmlFor="warehouse-location" error={errors.location}>
                <Input
                  id="warehouse-location"
                  value={form.location}
                  onChange={(event) => set("location", event.target.value)}
                  placeholder="例如 上海市松江区"
                />
              </FormField>
              <FormField label="负责人" htmlFor="warehouse-manager" error={errors.manager}>
                <Input
                  id="warehouse-manager"
                  value={form.manager}
                  onChange={(event) => set("manager", event.target.value)}
                  placeholder="仓库负责人姓名"
                />
              </FormField>
              <FormField label="状态" htmlFor="warehouse-active" error={errors.is_active}>
                <Select
                  id="warehouse-active"
                  value={form.is_active}
                  onValueChange={(value) => set("is_active", value)}
                  options={[
                    { value: "true", label: "启用" },
                    { value: "false", label: "停用" },
                  ]}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="备注" htmlFor="warehouse-remark" error={errors.remark}>
                  <Textarea
                    id="warehouse-remark"
                    value={form.remark}
                    onChange={(event) => set("remark", event.target.value)}
                    placeholder="选填，例如收货时间、仓库联系人"
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
              {warehouse ? "保存修改" : "创建仓库"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WarehousesPage() {
  useDocumentTitle("仓库");
  const { canManageMaster } = useAuth();
  const [q, setQ] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const debouncedQ = useDebouncedValue(q);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [deleting, setDeleting] = useState<Warehouse | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  useEffect(() => setPage(1), [debouncedQ, active]);

  const query = useApi<Page<Warehouse>>("/warehouses", {
    q: debouncedQ,
    is_active: active === "all" ? undefined : active,
    page,
    page_size: pageSize,
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/warehouses/${deleting.id}`);
      toast.success("仓库已删除");
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
        title="仓库"
        description="管理收货、存储与发货的物理仓库，以及每个仓库的负责人。"
        actions={
          canManageMaster ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              新建仓库
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="搜索仓库名称、编码或地点"
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
          {query.data ? `共 ${query.data.total} 个仓库` : "正在加载…"}
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
            icon={WarehouseIcon}
            title={q || active !== "all" ? "没有匹配的仓库" : "还没有仓库"}
            description={
              q || active !== "all"
                ? "试试调整搜索词或状态筛选。"
                : "创建第一个仓库，之后就可以入库和分配库存。"
            }
            actionLabel={canManageMaster ? "新建第一个仓库" : undefined}
            onAction={canManageMaster ? openCreate : undefined}
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
                .map((item) => `${item.code}\t${item.name}${item.location ? `\t${item.location}` : ""}`)
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
                      label="全选当前页仓库"
                    />
                  </th>
                  <th>仓库</th>
                  <th>地点</th>
                  <th>负责人</th>
                  <th className="text-right">商品数</th>
                  <th className="text-right">库存数量</th>
                  <th>状态</th>
                  <th className="w-[100px] text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td className="w-10 pr-0">
                      <TableCheckbox
                        checked={selection.selected.has(String(warehouse.id))}
                        onChange={(checked) => selection.toggle(String(warehouse.id), checked)}
                        label={`选择 ${warehouse.name}`}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                          <WarehouseIcon className="h-4 w-4" strokeWidth={1.7} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{warehouse.name}</p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {warehouse.code}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        {warehouse.location ? <MapPin className="h-3 w-3" /> : null}
                        {warehouse.location || "—"}
                      </span>
                    </td>
                    <td className="text-[12px] text-muted-foreground">{warehouse.manager || "—"}</td>
                    <td className="text-right text-[12px] tabular">{warehouse.sku_count}</td>
                    <td className="text-right text-[12px] font-medium tabular">
                      {formatQty(warehouse.total_quantity)}
                    </td>
                    <td>
                      <Badge variant={warehouse.is_active ? "success" : "muted"}>
                        {warehouse.is_active ? "启用" : "停用"}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setEditing(warehouse);
                            setDialogOpen(true);
                          }}
                          aria-label={`编辑 ${warehouse.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canManageMaster ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleting(warehouse)}
                            aria-label={`删除 ${warehouse.name}`}
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

      <WarehouseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        warehouse={editing}
        onSaved={query.reload}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="删除仓库"
        description={
          deleting
            ? `确定要删除「${deleting.name}」吗？仓库有库存或被单据引用时不能删除，请改为停用。`
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
        entityLabel="仓库"
        getPath={(warehouse) => `/warehouses/${warehouse.id}`}
        getLabel={(warehouse) => `${warehouse.code} ${warehouse.name}`}
        description="将永久删除选中的仓库。系统会保留至少一个启用仓库；有库存或被单据引用的仓库会被跳过并说明原因。"
        onDone={() => {
          query.reload();
          selection.clear();
        }}
      />
    </div>
  );
}
