import { useEffect, useState, type FormEvent } from "react";
import { Boxes, PackageMinus, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { useApi, useDebouncedValue, useDocumentTitle } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney, formatQty } from "@/lib/format";
import type { Page, Product, ProductStockClearResult } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { Pagination } from "@/components/common/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { BulkDeleteDialog } from "@/components/common/bulk-delete-dialog";
import { SelectionBar, TableCheckbox, useTableSelection } from "@/components/common/table-selection";
import { FormField, FormGrid } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
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

interface ProductFormState {
  sku: string;
  name: string;
  category: string;
  spec: string;
  unit: string;
  barcode: string;
  safety_stock: string;
  reference_cost: string;
  reference_price: string;
  remark: string;
  is_active: string;
}

const EMPTY_FORM: ProductFormState = {
  sku: "",
  name: "",
  category: "",
  spec: "",
  unit: "个",
  barcode: "",
  safety_stock: "0",
  reference_cost: "0",
  reference_price: "0",
  remark: "",
  is_active: "true",
};

function toForm(product: Product): ProductFormState {
  return {
    sku: product.sku,
    name: product.name,
    category: product.category,
    spec: product.spec,
    unit: product.unit,
    barcode: product.barcode || "",
    safety_stock: String(product.safety_stock),
    reference_cost: String(product.reference_cost),
    reference_price: String(product.reference_price),
    remark: product.remark,
    is_active: product.is_active ? "true" : "false",
  };
}

function ProductDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(product ? toForm(product) : EMPTY_FORM);
      setErrors({});
      setError(null);
    }
  }, [open, product]);

  const set = (key: keyof ProductFormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.sku.trim()) nextErrors.sku = "请输入商品编码";
    if (!form.name.trim()) nextErrors.name = "请输入商品名称";
    if (!form.unit.trim()) nextErrors.unit = "请输入计量单位";
    const safety = Number(form.safety_stock);
    const cost = Number(form.reference_cost);
    const price = Number(form.reference_price);
    if (!Number.isFinite(safety) || safety < 0) nextErrors.safety_stock = "安全库存不能小于 0";
    if (!Number.isFinite(cost) || cost < 0) nextErrors.reference_cost = "参考成本不能小于 0";
    if (!Number.isFinite(price) || price < 0) nextErrors.reference_price = "参考售价不能小于 0";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    setError(null);
    setErrors({});
    const payload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      spec: form.spec.trim(),
      unit: form.unit.trim(),
      barcode: form.barcode.trim() || null,
      safety_stock: safety,
      reference_cost: cost,
      reference_price: price,
      remark: form.remark.trim(),
      is_active: form.is_active === "true",
    };
    try {
      if (product) {
        await api.patch<Product>(`/products/${product.id}`, payload);
        toast.success("商品资料已更新");
      } else {
        await api.post<Product>("/products", payload);
        toast.success("商品已创建");
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
      <DialogContent size="lg">
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{product ? "编辑商品" : "新建商品"}</DialogTitle>
            <DialogDescription>
              商品编码用于单据与库存流水，创建后建议不要频繁修改。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5 py-2">
            <FormGrid>
              <FormField label="商品编码" htmlFor="sku" required error={errors.sku}>
                <Input
                  id="sku"
                  value={form.sku}
                  onChange={(event) => set("sku", event.target.value)}
                  placeholder="例如 SKU-1001"
                  autoFocus
                />
              </FormField>
              <FormField label="商品名称" htmlFor="name" required error={errors.name}>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="例如 无线机械键盘"
                />
              </FormField>
              <FormField label="分类" htmlFor="category" error={errors.category}>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(event) => set("category", event.target.value)}
                  placeholder="例如 电子配件"
                />
              </FormField>
              <FormField label="规格" htmlFor="spec" error={errors.spec}>
                <Input
                  id="spec"
                  value={form.spec}
                  onChange={(event) => set("spec", event.target.value)}
                  placeholder="例如 87 键 / 白色"
                />
              </FormField>
              <FormField label="计量单位" htmlFor="unit" required error={errors.unit}>
                <Input
                  id="unit"
                  value={form.unit}
                  onChange={(event) => set("unit", event.target.value)}
                  placeholder="个 / 台 / 箱"
                />
              </FormField>
              <FormField label="条码" htmlFor="barcode" error={errors.barcode} hint="可留空，填写时需唯一">
                <Input
                  id="barcode"
                  value={form.barcode}
                  onChange={(event) => set("barcode", event.target.value)}
                  placeholder="扫码枪录入或手工填写"
                />
              </FormField>
            </FormGrid>

            <div className="soft-divider" />

            <FormGrid>
              <FormField label="安全库存" htmlFor="safety_stock" error={errors.safety_stock}>
                <Input
                  id="safety_stock"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.safety_stock}
                  onChange={(event) => set("safety_stock", event.target.value)}
                />
              </FormField>
              <FormField label="状态" htmlFor="is_active" error={errors.is_active}>
                <Select
                  id="is_active"
                  value={form.is_active}
                  onValueChange={(value) => set("is_active", value)}
                  options={[
                    { value: "true", label: "启用" },
                    { value: "false", label: "停用" },
                  ]}
                />
              </FormField>
              <FormField label="参考成本（元）" htmlFor="reference_cost" error={errors.reference_cost}>
                <Input
                  id="reference_cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.reference_cost}
                  onChange={(event) => set("reference_cost", event.target.value)}
                />
              </FormField>
              <FormField label="参考售价（元）" htmlFor="reference_price" error={errors.reference_price}>
                <Input
                  id="reference_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.reference_price}
                  onChange={(event) => set("reference_price", event.target.value)}
                />
              </FormField>
            </FormGrid>

            <div>
              <Label htmlFor="product-remark">备注</Label>
              <Textarea
                id="product-remark"
                value={form.remark}
                onChange={(event) => set("remark", event.target.value)}
                placeholder="选填，例如供应商、包装说明"
                rows={2}
              />
            </div>

            {error ? (
              <p className="rounded-lg bg-destructive/[0.06] px-3 py-2 text-[12px] text-destructive">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button type="submit" loading={saving}>
              {product ? "保存修改" : "创建商品"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProductsPage() {
  useDocumentTitle("商品");
  const { canManageMaster } = useAuth();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const debouncedQ = useDebouncedValue(q);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [clearing, setClearing] = useState<Product | null>(null);
  const [clearLoading, setClearLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, category, active]);

  const query = useApi<Page<Product>>("/products", {
    q: debouncedQ,
    category,
    is_active: active === "all" ? undefined : active,
    page,
    page_size: pageSize,
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (product: Product) => {
    setEditing(product);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/products/${deleting.id}`);
      toast.success("商品已删除");
      setDeleting(null);
      query.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "删除失败，请稍后重试");
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmClearStock = async () => {
    if (!clearing) return;
    setClearLoading(true);
    try {
      const result = await api.post<ProductStockClearResult>(`/products/${clearing.id}/clear-stock`);
      toast.success(
        result.cleared_warehouses > 0
          ? `已清空 ${formatQty(result.cleared_quantity)} ${clearing.unit} 库存`
          : "该商品当前没有库存",
      );
      setClearing(null);
      query.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "清空库存失败，请稍后重试");
    } finally {
      setClearLoading(false);
    }
  };

  const items = query.data?.items ?? [];
  const selection = useTableSelection(items, (item) => String(item.id));

  return (
    <div>
      <PageHeader
        title="商品"
        description="统一管理商品档案与全部库存：可清空单品库存，删除商品时库存一并清除。"
        actions={
          canManageMaster ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              新建商品
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="搜索商品名称、编码或条码"
          className="w-full sm:max-w-[320px]"
        />
        <Input
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          placeholder="按分类筛选"
          className="h-9 sm:w-[160px]"
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
          {query.data ? `共 ${query.data.total} 个商品` : "正在加载…"}
        </p>
      </div>

      {query.loading ? (
        <TableSkeleton columns={7} />
      ) : query.error ? (
        <div className="app-card">
          <ErrorState message={query.error} onRetry={query.reload} />
        </div>
      ) : items.length === 0 ? (
        <div className="app-card">
          <EmptyState
            icon={Boxes}
            title={debouncedQ || category || active !== "all" ? "没有匹配的商品" : "还没有商品"}
            description={
              debouncedQ || category || active !== "all"
                ? "试试调整搜索词或筛选条件。"
                : "先创建商品档案，之后才能进行入库、出库与盘点。"
            }
            actionLabel={canManageMaster ? "新建第一个商品" : undefined}
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
                .map((item) => `${item.sku}\t${item.name}\t${formatQty(item.total_quantity)}${item.unit}`)
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
                      label="全选当前页商品"
                    />
                  </th>
                  <th>商品</th>
                  <th>分类</th>
                  <th>单位</th>
                  <th className="text-right">库存</th>
                  <th className="text-right">参考售价</th>
                  <th>状态</th>
                  <th className="w-[100px] text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => (
                  <tr key={product.id}>
                    <td className="w-10 pr-0">
                      <TableCheckbox
                        checked={selection.selected.has(String(product.id))}
                        onChange={(checked) => selection.toggle(String(product.id), checked)}
                        label={`选择 ${product.name}`}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F4F7] text-slate-500">
                          <Boxes className="h-4 w-4" strokeWidth={1.7} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{product.name}</p>
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {product.sku}
                            {product.spec ? ` · ${product.spec}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="text-[12px] text-muted-foreground">{product.category || "—"}</td>
                    <td className="text-[12px] text-muted-foreground">{product.unit}</td>
                    <td className="text-right">
                      <span className="text-[13px] font-medium tabular">{formatQty(product.total_quantity)}</span>
                      {product.is_low_stock ? (
                        <Badge variant="warning" className="ml-2">
                          低库存
                        </Badge>
                      ) : null}
                    </td>
                    <td className="text-right text-[12px] tabular">{formatMoney(product.reference_price)}</td>
                    <td>
                      <Badge variant={product.is_active ? "success" : "muted"}>
                        {product.is_active ? "启用" : "停用"}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(product)}
                          aria-label={`编辑 ${product.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canManageMaster && product.total_quantity > 0 ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setClearing(product)}
                            aria-label={`清空 ${product.name} 库存`}
                            title="清空库存"
                          >
                            <PackageMinus className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {canManageMaster ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleting(product)}
                            aria-label={`删除 ${product.name}`}
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

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        onSaved={query.reload}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="删除商品及库存"
        description={
          deleting
            ? `确定要删除「${deleting.name}」吗？该商品在所有仓库的库存会一起清除，删除后不可恢复。被历史单据引用的商品不能删除，可改为停用。`
            : ""
        }
        confirmLabel="删除商品"
        destructive
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={Boolean(clearing)}
        onOpenChange={(next) => !next && setClearing(null)}
        title="清空商品库存"
        description={
          clearing
            ? `将「${clearing.name}」在全部仓库的 ${formatQty(clearing.total_quantity)} ${clearing.unit} 库存清零，并写入库存调整流水。商品档案会保留。`
            : ""
        }
        confirmLabel="清空库存"
        destructive
        loading={clearLoading}
        onConfirm={confirmClearStock}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        rows={selection.selectedRows}
        entityLabel="商品"
        getPath={(product) => `/products/${product.id}`}
        getLabel={(product) => `${product.sku} ${product.name}`}
        description="将永久删除选中的商品档案，并一并清除这些商品在所有仓库的库存与库存流水。被历史单据引用的商品会保留，并说明原因。"
        onDone={() => {
          query.reload();
          selection.clear();
        }}
      />
    </div>
  );
}
