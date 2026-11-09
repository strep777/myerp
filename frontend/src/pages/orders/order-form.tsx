import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Info, Plus, Save, Trash2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { useApi, useDocumentTitle } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { formatMoney, formatQty } from "@/lib/format";
import type { AnyOrder, OrderType } from "./order-meta";
import type { InventoryOverview, PartnerOption, ProductOption, WarehouseOption } from "@/lib/types";
import { PageHeader } from "@/components/common/page-header";
import { FormField, FormGrid, FormSection } from "@/components/common/form";
import { ProductPicker } from "@/components/common/product-picker";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ORDER_META } from "./order-meta";

interface LineState {
  key: number;
  product: ProductOption | null;
  quantity: string;
  unit_cost: string;
  remark: string;
}

function newLine(key: number): LineState {
  return { key, product: null, quantity: "", unit_cost: "", remark: "" };
}

export function OrderFormPage({ type }: { type: OrderType }) {
  const meta = ORDER_META[type];
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  useDocumentTitle(isEdit ? `编辑${meta.singular}` : meta.newTitle);
  const { canWriteDocs } = useAuth();

  const order = useApi<AnyOrder>(isEdit ? `${meta.api}/${id}` : null);
  const warehouses = useApi<WarehouseOption[]>("/warehouses/options");
  const partners = useApi<PartnerOption[]>(
    type === "inbound" ? "/suppliers/options" : "/customers/options",
    undefined,
    { enabled: type !== "transfer" },
  );

  const [warehouseId, setWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [partnerId, setPartnerId] = useState("none");
  const [relatedNo, setRelatedNo] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [remark, setRemark] = useState("");
  const [lines, setLines] = useState<LineState[]>([newLine(1)]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const nextKey = useRef(2);
  const [overview, setOverview] = useState<InventoryOverview | null>(null);

  useEffect(() => {
    if (type !== "outbound" || !warehouseId) {
      setOverview(null);
      return;
    }
    let active = true;
    api
      .get<InventoryOverview>("/inventory/overview", { warehouse_id: warehouseId })
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch(() => {
        if (active) setOverview(null);
      });
    return () => {
      active = false;
    };
  }, [type, warehouseId, isEdit, order.data?.id]);

  useEffect(() => {
    if (!isEdit || !order.data || initialized) return;
    const data = order.data;
    if (data.status !== "DRAFT") {
      toast.error("只有草稿状态的单据可以编辑");
      navigate(`${meta.path}/${data.id}`, { replace: true });
      return;
    }
    const transfer = "from_warehouse_id" in data;
    setWarehouseId(
      String(transfer ? data.from_warehouse_id : (data as { warehouse_id: number }).warehouse_id),
    );
    if (transfer) setToWarehouseId(String(data.to_warehouse_id));
    if ("supplier_id" in data) setPartnerId(data.supplier_id ? String(data.supplier_id) : "none");
    if ("customer_id" in data) setPartnerId(data.customer_id ? String(data.customer_id) : "none");
    if (!transfer) {
      setRelatedNo((data as { related_no: string }).related_no || "");
      setExpectedDate((data as { expected_date: string | null }).expected_date || "");
    }
    setRemark(data.remark || "");
    setLines(
      data.lines.length
        ? data.lines.map((line, index) => ({
            key: index + 1,
            product: {
              id: line.product_id,
              sku: line.sku,
              name: line.product_name,
              unit: line.unit,
              spec: "",
            },
            quantity: String(line.quantity),
            unit_cost: "unit_cost" in line ? String(line.unit_cost) : "",
            remark: line.remark || "",
          }))
        : [newLine(1)],
    );
    nextKey.current = data.lines.length + 2;
    setInitialized(true);
  }, [isEdit, order.data, initialized, meta.path, navigate]);

  useEffect(() => {
    if (!canWriteDocs && !order.loading) {
      toast.error("没有创建或编辑单据的权限");
      navigate(meta.path, { replace: true });
    }
  }, [canWriteDocs, order.loading, meta.path, navigate]);

  const setLine = (key: number, patch: Partial<LineState>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const addLine = () => {
    const key = nextKey.current++;
    setLines((current) => [...current, newLine(key)]);
  };

  const removeLine = (key: number) => {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current));
  };

  const pickProduct = (key: number, product: ProductOption) => {
    if (lines.some((line) => line.key !== key && line.product?.id === product.id)) {
      toast.warning("同一商品不能重复添加");
      return;
    }
    setLine(key, { product, quantity: lines.find((line) => line.key === key)?.quantity || "" });
  };

  const totalQuantity = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const totalAmount = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0),
    0,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!warehouseId) nextErrors.warehouse_id = type === "transfer" ? "请选择调出仓库" : "请选择仓库";
    if (type === "transfer" && !toWarehouseId) nextErrors.to_warehouse_id = "请选择调入仓库";
    if (type === "transfer" && warehouseId && toWarehouseId && warehouseId === toWarehouseId) {
      nextErrors.to_warehouse_id = "调出仓库和调入仓库不能相同";
    }
    const prepared = lines.map((line) => ({
      product_id: line.product?.id,
      quantity: Number(line.quantity),
      unit_cost: Number(line.unit_cost || 0),
      remark: line.remark.trim(),
    }));
    if (prepared.length === 0) nextErrors.lines = "请至少添加一行商品";
    prepared.forEach((line, index) => {
      if (!line.product_id) nextErrors[`lines.${index}.product_id`] = "请选择商品";
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        nextErrors[`lines.${index}.quantity`] = "数量必须大于 0";
      }
      if (type === "inbound" && (!Number.isFinite(line.unit_cost) || line.unit_cost < 0)) {
        nextErrors[`lines.${index}.unit_cost`] = "单位成本不能为负数";
      }
    });
    const ids = prepared.map((line) => line.product_id).filter(Boolean);
    if (new Set(ids).size !== ids.length) nextErrors.lines = "同一商品不能重复添加";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setError("请检查标红的字段后再保存");
      return;
    }
    setSaving(true);
    setError(null);
    setErrors({});
    try {
      const payload =
        type === "transfer"
          ? {
              from_warehouse_id: Number(warehouseId),
              to_warehouse_id: Number(toWarehouseId),
              remark: remark.trim(),
              lines: prepared.map(({ product_id, quantity, remark: lineRemark }) => ({
                product_id,
                quantity,
                remark: lineRemark,
              })),
            }
          : {
              ...(type === "inbound"
                ? { supplier_id: partnerId === "none" ? null : Number(partnerId) }
                : { customer_id: partnerId === "none" ? null : Number(partnerId) }),
              warehouse_id: Number(warehouseId),
              related_no: relatedNo.trim(),
              expected_date: expectedDate || null,
              remark: remark.trim(),
              lines:
                type === "inbound"
                  ? prepared
                  : prepared.map(({ product_id, quantity, remark: lineRemark }) => ({
                      product_id,
                      quantity,
                      remark: lineRemark,
                    })),
            };
      const saved = isEdit
        ? await api.put<AnyOrder>(`${meta.api}/${id}`, payload)
        : await api.post<AnyOrder>(meta.api, payload);
      toast.success(isEdit ? `${meta.singular}已保存` : `${meta.singular}草稿已创建`);
      navigate(`${meta.path}/${saved.id}`);
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

  if (isEdit && order.loading) {
    return (
      <div>
        <PageHeader title={`编辑${meta.singular}`} back={`${meta.path}/${id}`} />
        <TableSkeleton columns={4} />
      </div>
    );
  }

  if (isEdit && order.error) {
    return (
      <div>
        <PageHeader title={`编辑${meta.singular}`} back={meta.path} />
        <div className="app-card">
          <ErrorState message={order.error} onRetry={order.reload} />
        </div>
      </div>
    );
  }

  if (warehouses.data && warehouses.data.length === 0) {
    return (
      <div>
        <PageHeader title={meta.newTitle} back={meta.path} />
        <div className="app-card">
          <EmptyState
            icon={Warehouse}
            title="还没有可用仓库"
            description="单据必须归属仓库。请先到「仓库」页面启用至少一个仓库。"
            actionLabel="前往仓库"
            onAction={() => navigate("/warehouses")}
          />
        </div>
      </div>
    );
  }

  const warehouseOptions = (warehouses.data ?? []).map((warehouse) => ({
    value: String(warehouse.id),
    label: `${warehouse.name} · ${warehouse.code}`,
  }));
  const partnerOptions = [
    {
      value: "none",
      label: type === "inbound" ? "不指定供应商" : "不指定客户",
    },
    ...(partners.data ?? []).map((partner) => ({
      value: String(partner.id),
      label: `${partner.name} · ${partner.code}`,
    })),
  ];
  const toWarehouseOptions = (warehouses.data ?? []).map((warehouse) => ({
    value: String(warehouse.id),
    label: `${warehouse.name} · ${warehouse.code}`,
    disabled: String(warehouse.id) === warehouseId,
  }));

  return (
    <div>
      <PageHeader
        title={isEdit ? `编辑${meta.singular}` : meta.newTitle}
        description={
          isEdit
            ? "只有草稿状态可以修改。保存后会保留当前草稿编号。"
            : "先保存为草稿，核对无误后再确认；确认动作才会真正改变库存。"
        }
        back={isEdit ? `${meta.path}/${id}` : meta.path}
      />

      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <FormSection
          title="单据信息"
          description={
            type === "transfer"
              ? "选择调出与调入仓库。调拨确认后，两个仓库会同时产生流水。"
              : `选择${type === "inbound" ? "收货" : "发货"}仓库与${type === "inbound" ? "供应商" : "客户"}。`
          }
        >
          <FormGrid>
            {type === "transfer" ? (
              <>
                <FormField
                  label="调出仓库"
                  htmlFor="from-warehouse"
                  required
                  error={errors.from_warehouse_id || errors.warehouse_id}
                >
                  <Select
                    id="from-warehouse"
                    value={warehouseId}
                    onValueChange={(value) => {
                      setWarehouseId(value);
                      if (value === toWarehouseId) setToWarehouseId("");
                    }}
                    options={warehouseOptions}
                    placeholder="选择调出仓库"
                  />
                </FormField>
                <FormField
                  label="调入仓库"
                  htmlFor="to-warehouse"
                  required
                  error={errors.to_warehouse_id}
                >
                  <Select
                    id="to-warehouse"
                    value={toWarehouseId}
                    onValueChange={setToWarehouseId}
                    options={toWarehouseOptions}
                    placeholder="选择调入仓库"
                  />
                </FormField>
              </>
            ) : (
              <>
                <FormField label="仓库" htmlFor="warehouse" required error={errors.warehouse_id}>
                  <Select
                    id="warehouse"
                    value={warehouseId}
                    onValueChange={setWarehouseId}
                    options={warehouseOptions}
                    placeholder="选择仓库"
                  />
                </FormField>
                <FormField
                  label={type === "inbound" ? "供应商" : "客户"}
                  htmlFor="partner"
                  error={errors.supplier_id || errors.customer_id}
                  hint="可选。未指定时单据仍然有效。"
                >
                  <Select
                    id="partner"
                    value={partnerId}
                    onValueChange={setPartnerId}
                    options={partnerOptions}
                    placeholder={type === "inbound" ? "选择供应商" : "选择客户"}
                  />
                </FormField>
                <FormField label="关联单号" htmlFor="related-no" error={errors.related_no} hint="可选，例如采购单号、销售单号">
                  <Input
                    id="related-no"
                    value={relatedNo}
                    onChange={(event) => setRelatedNo(event.target.value)}
                    placeholder="外部系统或纸质单据编号"
                  />
                </FormField>
                <FormField label="预计日期" htmlFor="expected-date" error={errors.expected_date}>
                  <Input
                    id="expected-date"
                    type="date"
                    value={expectedDate}
                    onChange={(event) => setExpectedDate(event.target.value)}
                  />
                </FormField>
              </>
            )}
            <div className="sm:col-span-2">
              <FormField label="备注" htmlFor="order-remark" error={errors.remark}>
                <Textarea
                  id="order-remark"
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                  placeholder="选填，记录来源、收货说明或特殊约定"
                  rows={2}
                />
              </FormField>
            </div>
          </FormGrid>
          {type === "outbound" && warehouseId && overview ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50/60 px-3 py-2 text-[11px] text-blue-800">
              <Info className="h-3.5 w-3.5 shrink-0" />
              该仓库当前共有 {formatQty(overview.total_quantity)} 件库存，{overview.sku_count} 个 SKU；确认时会逐行校验可用量。
            </div>
          ) : null}
        </FormSection>

        <FormSection
          title="商品明细"
          description="同一商品在一张单据中只能出现一次。数量最多保留 4 位小数。"
          className="pb-3"
        >
          <div className="hidden grid-cols-[minmax(220px,2.6fr)_110px_130px_minmax(120px,1fr)_36px] items-center gap-2 px-1 pb-2 text-[11px] font-medium text-muted-foreground md:grid">
            <span>商品</span>
            <span className="text-right">数量</span>
            {type === "inbound" ? <span className="text-right">单位成本</span> : <span />}
            <span>行备注</span>
            <span />
          </div>

          <div className="space-y-2">
            {lines.map((line, index) => {
              const rowError = errors.lines;
              const productError = errors[`lines.${index}.product_id`];
              const quantityError = errors[`lines.${index}.quantity`];
              const costError = errors[`lines.${index}.unit_cost`];
              return (
                <div
                  key={line.key}
                  className="grid grid-cols-1 gap-2 rounded-xl border border-black/[0.06] bg-white p-3 md:grid-cols-[minmax(220px,2.6fr)_110px_130px_minmax(120px,1fr)_36px] md:items-center md:border-0 md:bg-transparent md:p-1"
                >
                  <div>
                    <p className="field-label md:hidden">商品</p>
                    <ProductPicker
                      selected={line.product}
                      onChange={(product) => pickProduct(line.key, product)}
                      invalid={Boolean(productError)}
                    />
                    {productError ? <p className="mt-1 text-[11px] text-destructive">{productError}</p> : null}
                  </div>
                  <div>
                    <p className="field-label md:hidden">数量</p>
                    <Input
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) => setLine(line.key, { quantity: event.target.value })}
                      placeholder="0"
                      className={cn("h-9 text-right tabular", quantityError && "border-destructive/60")}
                      aria-label={`第 ${index + 1} 行数量`}
                    />
                    {quantityError ? <p className="mt-1 text-[11px] text-destructive">{quantityError}</p> : null}
                  </div>
                  <div>
                    {type === "inbound" ? (
                      <>
                        <p className="field-label md:hidden">单位成本</p>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                            ¥
                          </span>
                          <Input
                            inputMode="decimal"
                            value={line.unit_cost}
                            onChange={(event) => setLine(line.key, { unit_cost: event.target.value })}
                            placeholder="0.00"
                            className={cn("h-9 pl-6 text-right tabular", costError && "border-destructive/60")}
                            aria-label={`第 ${index + 1} 行单位成本`}
                          />
                        </div>
                        {costError ? <p className="mt-1 text-[11px] text-destructive">{costError}</p> : null}
                      </>
                    ) : (
                      <div className="hidden md:block" />
                    )}
                  </div>
                  <div>
                    <p className="field-label md:hidden">行备注</p>
                    <Input
                      value={line.remark}
                      onChange={(event) => setLine(line.key, { remark: event.target.value })}
                      placeholder="选填"
                      className="h-9 text-[12px]"
                      aria-label={`第 ${index + 1} 行备注`}
                    />
                  </div>
                  <div className="flex justify-end md:justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                      aria-label={`删除第 ${index + 1} 行`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {errors.lines ? (
            <p className="mt-2 rounded-lg bg-destructive/[0.06] px-3 py-2 text-[11px] text-destructive">
              {errors.lines}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" />
              添加一行
            </Button>
            <div className="flex items-baseline gap-5 text-[12px]">
              <span className="text-muted-foreground">
                合计数量 <span className="ml-1 font-semibold text-foreground tabular">{formatQty(totalQuantity)}</span>
              </span>
              {type === "inbound" ? (
                <span className="text-muted-foreground">
                  合计金额 <span className="ml-1 font-semibold text-foreground tabular">{formatMoney(totalAmount)}</span>
                </span>
              ) : null}
            </div>
          </div>
        </FormSection>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-[12px] text-red-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 pb-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(isEdit ? `${meta.path}/${id}` : meta.path)}
            disabled={saving}
          >
            <ArrowLeft className="h-4 w-4" />
            取消
          </Button>
          <Button type="submit" loading={saving}>
            <Save className="h-4 w-4" />
            {isEdit ? "保存修改" : "保存草稿"}
          </Button>
        </div>
      </form>
    </div>
  );
}
