import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  PackageCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api";
import { useApi, useDocumentTitle } from "@/hooks/use-api";
import { formatMoney, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AiAnalyzeResult,
  AiImportResult,
  AiLinePreview,
  PartnerOption,
  WarehouseOption,
} from "@/lib/types";

type SourceMode = "image" | "link" | "text";

const MAX_IMAGE = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const inputClass =
  "h-9 w-full rounded-lg border border-black/[0.09] bg-white px-3 text-[12px] shadow-[inset_0_1px_1px_rgba(15,23,42,0.02)] outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10";

export function AiPage() {
  useDocumentTitle("AI 智能入库");
  const navigate = useNavigate();
  const warehouses = useApi<WarehouseOption[]>("/warehouses/options", { limit: 50 });
  const suppliers = useApi<PartnerOption[]>("/suppliers/options", { limit: 50 });

  const [mode, setMode] = useState<SourceMode>("image");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalyzeResult | null>(null);
  const [lines, setLines] = useState<AiLinePreview[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierId, setSupplierId] = useState("auto");
  const [supplierName, setSupplierName] = useState("");
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<AiImportResult | null>(null);
  const [pasting, setPasting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!warehouseId && warehouses.data?.length) {
      const active = warehouses.data[0];
      if (!analysis?.items.length) setWarehouseId(String(active.id));
    }
  }, [analysis, warehouseId, warehouses.data]);

  const supplierOptions = useMemo(
    () => [
      { value: "auto", label: "按识别结果自动匹配或创建" },
      ...(suppliers.data ?? []).map((item) => ({ value: String(item.id), label: `${item.name} · ${item.code}` })),
    ],
    [suppliers.data],
  );

  const selectFile = (next: File | null) => {
    if (!next) {
      setFile(null);
      return false;
    }
    if (!IMAGE_TYPES.includes(next.type)) {
      toast.error("只支持 PNG、JPEG、WebP、GIF 图片");
      return false;
    }
    if (next.size > MAX_IMAGE) {
      toast.error("图片不能超过 4MB，请压缩后再上传");
      return false;
    }
    setFile(next);
    setAnalysis(null);
    setLines([]);
    setResult(null);
    return true;
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const imageItem = Array.from(items).find(
        (item) => item.kind === "file" && IMAGE_TYPES.includes(item.type),
      );
      const pasted = imageItem?.getAsFile();
      if (!pasted) return;
      event.preventDefault();
      setMode("image");
      if (selectFile(pasted)) toast.success("已从剪贴板读取截图");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.read) {
      toast.error("当前浏览器不支持读取剪贴板，请直接按 Ctrl+V 粘贴");
      return;
    }
    setPasting(true);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((value) => IMAGE_TYPES.includes(value));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1];
        if (!selectFile(new File([blob], `clipboard-${Date.now()}.${extension}`, { type }))) return;
        setMode("image");
        toast.success("已从剪贴板读取截图");
        return;
      }
      toast.error("剪贴板里没有图片，请先复制一张截图");
    } catch {
      toast.error("无法读取剪贴板，请直接按 Ctrl+V 粘贴");
    } finally {
      setPasting(false);
    }
  };

  const analyze = async () => {
    if (mode === "image" && !file) {
      toast.error("请先上传购买截图");
      return;
    }
    if (mode === "link" && !/^https?:\/\//i.test(link.trim())) {
      toast.error("请输入以 http:// 或 https:// 开头的商品链接");
      return;
    }
    if (mode === "text" && note.trim().length < 8) {
      toast.error("请至少输入 8 个字的商品描述");
      return;
    }

    setAnalyzing(true);
    setAnalysis(null);
    setLines([]);
    setResult(null);
    try {
      const form = new FormData();
      if (mode === "image" && file) form.append("image", file);
      if (mode === "link") form.append("link", link.trim());
      if (note.trim()) form.append("text", note.trim());
      const data = await api.postForm<AiAnalyzeResult>("/ai/analyze", form);
      setAnalysis(data);
      setLines(data.items);
      setSupplierName(data.supplier_name || "");
      setSupplierId("auto");
      setAutoConfirm(true);
      if (!warehouseId && warehouses.data?.length) {
        setWarehouseId(String(warehouses.data[0].id));
      }
      toast.success(`识别到 ${data.items.length} 个商品`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "AI 分析失败，请稍后重试");
    } finally {
      setAnalyzing(false);
    }
  };

  const updateLine = (index: number, patch: Partial<AiLinePreview>) => {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  };

  const importLines = async () => {
    if (!analysis) return;
    if (!warehouseId) {
      toast.error("请选择入库仓库");
      return;
    }
    if (lines.length === 0) {
      toast.error("至少保留一行商品");
      return;
    }
    const invalid = lines.find((line) => !line.name.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0);
    if (invalid) {
      toast.error("请补全商品名称，并确保数量大于 0");
      return;
    }

    setImporting(true);
    try {
      const data = await api.post<AiImportResult>("/ai/import", {
        token: analysis.token,
        warehouse_id: Number(warehouseId),
        supplier_id: supplierId && supplierId !== "auto" ? Number(supplierId) : null,
        supplier_name: supplierName.trim(),
        create_supplier: supplierId === "auto",
        related_no: analysis.related_no || "",
        remark: `AI 识别入库 · ${analysis.source_summary}`.slice(0, 240),
        expected_date: analysis.order_date || null,
        auto_confirm: autoConfirm,
        lines: lines.map((line) => ({
          product_id: line.matched_product_id,
          sku: line.sku,
          name: line.name,
          spec: line.spec,
          category: line.category,
          unit: line.unit,
          barcode: line.barcode,
          quantity: line.quantity,
          unit_cost: line.unit_cost,
          reference_price: line.reference_price,
        })),
      });
      setResult(data);
      toast.success(data.auto_confirmed ? "已确认入库，库存已更新" : "已生成入库草稿");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "入库失败，请稍后重试");
    } finally {
      setImporting(false);
    }
  };

  const totalQuantity = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const totalAmount = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0),
    0,
  );

  return (
    <div>
      <PageHeader
        title="AI 智能入库"
        description="上传购买截图或粘贴商品链接，让 AI 提取商品、数量与金额，核对后直接入库。"
        actions={
          <Button variant="secondary" onClick={() => navigate("/system/settings")}>
            <Sparkles className="h-4 w-4" />
            AI 设置
          </Button>
        }
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 py-2.5 text-[11px] leading-5 text-blue-900">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p>
          AI 只负责“读图/读链接”和生成预览，<strong>确认入库</strong>后才会写入库存。图片、链接内容只用于本次分析；密钥保存在服务端。
        </p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section className="app-card p-4 xl:sticky xl:top-20">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">信息来源</h2>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
              约 5–30 秒
            </span>
          </div>

          <Tabs value={mode} onValueChange={(value) => { setMode(value as SourceMode); setResult(null); }}>
            <TabsList className="w-full">
              <TabsTrigger value="image" className="flex-1"><ImageIcon className="h-3.5 w-3.5" />截图</TabsTrigger>
              <TabsTrigger value="link" className="flex-1"><Link2 className="h-3.5 w-3.5" />链接</TabsTrigger>
              <TabsTrigger value="text" className="flex-1"><FileText className="h-3.5 w-3.5" />文字</TabsTrigger>
            </TabsList>

            <TabsContent value="image" className="mt-3">
              <input
                ref={fileInput}
                type="file"
                accept={IMAGE_TYPES.join(",")}
                className="hidden"
                onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="relative overflow-hidden rounded-xl border border-black/[0.08] bg-secondary/30">
                  <img src={previewUrl} alt="购买截图预览" className="h-52 w-full object-contain" />
                  <button
                    type="button"
                    onClick={() => selectFile(null)}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur"
                    aria-label="移除图片"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="border-t border-black/[0.06] bg-white px-3 py-2">
                    <p className="truncate text-[11px] font-medium">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    selectFile(event.dataTransfer.files?.[0] ?? null);
                  }}
                  className={cn(
                    "flex h-52 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center transition",
                    dragging ? "border-primary/50 bg-blue-50" : "border-black/[0.1] bg-secondary/20 hover:bg-secondary/40",
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                    <UploadCloud className="h-5 w-5 text-primary" />
                  </span>
                  <span className="mt-2.5 text-[12px] font-medium">拖入、点击上传，或按 Ctrl+V 粘贴截图</span>
                  <span className="mt-1 text-[10px] leading-4 text-muted-foreground">PNG / JPEG / WebP / GIF，最大 4MB</span>
                </button>
              )}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 px-3 text-[11px]"
                  onClick={() => void pasteFromClipboard()}
                  loading={pasting}
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  从剪贴板粘贴
                </Button>
                <span className="text-[10px] text-muted-foreground">已复制截图？直接按 Ctrl+V</span>
              </div>
            </TabsContent>

            <TabsContent value="link" className="mt-3">
              <span className="field-label">商品链接</span>
              <Input
                value={link}
                onChange={(event) => { setLink(event.target.value); setResult(null); }}
                placeholder="https://item.taobao.com/... 或京东、拼多多商品页"
                className={inputClass}
              />
              <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                服务端会抓取页面标题和正文。内网地址、登录页与需要验证码的页面无法读取。
              </p>
            </TabsContent>

            <TabsContent value="text" className="mt-3">
              <span className="field-label">商品描述</span>
              <textarea
                value={note}
                onChange={(event) => { setNote(event.target.value); setResult(null); }}
                rows={4}
                placeholder="例如：无线鼠标 2 个，单价 45 元；USB-C 数据线 3 条，单价 16 元"
                className="w-full resize-none rounded-lg border border-black/[0.09] bg-white p-3 text-[12px] leading-5 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </TabsContent>
          </Tabs>

          {mode !== "text" ? (
            <div className="mt-3">
              <span className="field-label">补充说明（可选）</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="例如：这是 8 月的采购，供应商为晨光文具"
                className="w-full resize-none rounded-lg border border-black/[0.09] bg-white p-2.5 text-[11px] leading-5 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </div>
          ) : null}

          <Button className="mt-3 w-full" onClick={() => void analyze()} loading={analyzing}>
            <Sparkles className="h-4 w-4" />
            {analyzing ? "AI 正在识别…" : "开始 AI 识别"}
          </Button>
          <p className="mt-2 text-center text-[9px] text-muted-foreground">分析结果仅供核对，请确认商品与数量后再入库</p>
        </section>

        <section className="min-w-0">
          {result ? (
            <div className="app-card p-6">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <PackageCheck className="h-7 w-7" />
                </span>
                <h2 className="mt-3 text-[17px] font-semibold">
                  {result.auto_confirmed ? "入库完成，库存已更新" : "入库草稿已生成"}
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {result.auto_confirmed
                    ? "库存流水与单据已同步，可在单据详情中继续核对。"
                    : result.message || "可以在单据详情中继续核对。"}
                </p>
                <div className="mt-4 grid w-full max-w-md grid-cols-3 gap-2 rounded-xl bg-secondary/40 p-3 text-left">
                  <div>
                    <p className="text-[10px] text-muted-foreground">单号</p>
                    <p className="mt-1 font-mono text-[12px] font-semibold">{result.order_no}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">数量</p>
                    <p className="mt-1 text-[12px] font-semibold tabular">{formatQty(result.total_quantity)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">金额</p>
                    <p className="mt-1 text-[12px] font-semibold tabular">{formatMoney(result.total_amount)}</p>
                  </div>
                </div>
                {result.created_products.length > 0 ? (
                  <p className="mt-3 text-[10px] text-muted-foreground">
                    新建商品：{result.created_products.join("、")}
                  </p>
                ) : null}
                <div className="mt-5 flex gap-2">
                  <Button variant="secondary" onClick={() => {
                    setResult(null);
                    setAnalysis(null);
                    setLines([]);
                    setFile(null);
                    setLink("");
                    setNote("");
                    setSupplierId("auto");
                    setSupplierName("");
                  }}>
                    再识别一单
                  </Button>
                  <Button onClick={() => navigate(`/inbound-orders/${result.order_id}`)}>
                    查看入库单
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ) : analyzing ? (
            <div className="app-card flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </span>
              <h2 className="mt-4 text-[14px] font-semibold">正在读取并整理商品信息…</h2>
              <p className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">
                AI 会识别商品名称、规格、数量与实付金额，并与现有商品档案匹配。请勿关闭页面。
              </p>
            </div>
          ) : !analysis ? (
            <div className="app-card flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                <Sparkles className="h-6 w-6 text-primary" />
              </span>
              <h2 className="mt-4 text-[14px] font-semibold">AI 识别结果会出现在这里</h2>
              <p className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">
                上传截图、粘贴链接或输入商品描述，AI 会生成可编辑的入库预览。确认前不会改变任何库存。
              </p>
              <div className="mt-5 grid w-full max-w-md gap-2 text-left">
                {[
                  ["1", "提供来源", "购买截图 / 商品链接 / 文字描述"],
                  ["2", "核对预览", "商品、数量、单价、供应商"],
                  ["3", "确认入库", "服务端校验后写入库存"],
                ].map(([step, title, text]) => (
                  <div key={step} className="flex items-center gap-3 rounded-lg border border-black/[0.05] bg-secondary/20 px-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-primary shadow-sm">
                      {step}
                    </span>
                    <div>
                      <p className="text-[11px] font-medium">{title}</p>
                      <p className="text-[10px] text-muted-foreground">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="app-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[13px] font-semibold">识别预览</h2>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {analysis.source_summary} · {analysis.provider} / {analysis.model} · {analysis.latency_ms}ms
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                    {lines.length} 个商品
                  </span>
                </div>

                {analysis.warnings.length > 0 ? (
                  <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>{analysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
                  </div>
                ) : null}

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">入库仓库 <span className="text-rose-500">*</span></span>
                    <Select
                      value={warehouseId || undefined}
                      onValueChange={setWarehouseId}
                      placeholder="选择仓库"
                      options={(warehouses.data ?? []).map((item) => ({
                        value: String(item.id),
                        label: `${item.name} · ${item.code}`,
                      }))}
                      className="h-9"
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">供应商（可选）</span>
                    <Select
                      value={supplierId}
                      onValueChange={(value) => {
                        setSupplierId(value);
                        if (value !== "auto") {
                          setSupplierName(suppliers.data?.find((item) => String(item.id) === value)?.name ?? "");
                        }
                      }}
                      options={supplierOptions}
                      className="h-9"
                    />
                  </label>
                </div>

                {supplierId === "auto" && supplierName ? (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    将按识别名称“{supplierName}”匹配供应商；不存在时自动创建。
                  </p>
                ) : null}
              </div>

              <div className="app-card overflow-hidden">
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[620px] text-left text-[12px]">
                    <thead className="border-b border-black/[0.06] bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">商品</th>
                        <th className="w-[110px] px-3 py-2.5 text-right font-medium">数量</th>
                        <th className="w-[120px] px-3 py-2.5 text-right font-medium">单价</th>
                        <th className="w-[100px] px-3 py-2.5 text-right font-medium">小计</th>
                        <th className="w-10 px-2 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.05]">
                      {lines.map((line, index) => (
                        <tr key={`${line.name}-${index}`} className="align-top">
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              <span className={cn(
                                "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                                line.match_type === "existing" ? "bg-emerald-500" : "bg-amber-400",
                              )} />
                              <div className="min-w-0 flex-1">
                                <Input
                                  value={line.name}
                                  onChange={(event) => updateLine(index, { name: event.target.value })}
                                  className="h-7 border-transparent bg-transparent px-1 text-[12px] font-medium shadow-none hover:border-black/[0.08] focus:border-primary/30"
                                />
                                <div className="mt-0.5 flex flex-wrap items-center gap-2 px-1 text-[10px] text-muted-foreground">
                                  <span className="font-mono">{line.sku || "自动生成 SKU"}</span>
                                  {line.spec ? <span>· {line.spec}</span> : null}
                                  <span className="rounded bg-secondary px-1 py-0.5 text-[9px]">{Math.round(line.confidence * 100)}% 置信</span>
                                  {line.match_type === "new" ? <span className="text-amber-700">将新建商品</span> : <span className="text-emerald-700">匹配 {line.matched_product_name}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              type="number"
                              min={0}
                              step="1"
                              value={line.quantity}
                              onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}
                              className="h-8 w-24 text-right text-[12px]"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={line.unit_cost}
                              onChange={(event) => updateLine(index, { unit_cost: Number(event.target.value) })}
                              className="h-8 w-24 text-right text-[12px]"
                            />
                          </td>
                          <td className="px-3 py-3 text-right text-[12px] font-medium tabular">
                            {formatMoney((Number(line.quantity) || 0) * (Number(line.unit_cost) || 0))}
                          </td>
                          <td className="px-2 py-3 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                              aria-label="移除这一行"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-black/[0.05] md:hidden">
                  {lines.map((line, index) => (
                    <div key={`${line.name}-${index}`} className="p-4">
                      <div className="flex items-start gap-2">
                        <span className={cn(
                          "mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          line.match_type === "existing" ? "bg-emerald-500" : "bg-amber-400",
                        )} />
                        <div className="min-w-0 flex-1">
                          <Input
                            value={line.name}
                            onChange={(event) => updateLine(index, { name: event.target.value })}
                            className="h-8 border-transparent bg-transparent px-1 text-[12px] font-medium shadow-none hover:border-black/[0.08] focus:border-primary/30"
                          />
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 px-1 text-[10px] text-muted-foreground">
                            <span className="font-mono">{line.sku || "自动生成 SKU"}</span>
                            {line.spec ? <span>· {line.spec}</span> : null}
                            <span className="rounded bg-secondary px-1 py-0.5 text-[9px]">{Math.round(line.confidence * 100)}% 置信</span>
                            {line.match_type === "new" ? <span className="text-amber-700">将新建商品</span> : <span className="text-emerald-700">匹配 {line.matched_product_name}</span>}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                          aria-label="移除这一行"
                          className="mt-0.5 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <label className="block">
                          <span className="field-label">数量</span>
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            value={line.quantity}
                            onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}
                            className="h-9 text-right text-[12px]"
                          />
                        </label>
                        <label className="block">
                          <span className="field-label">单价</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unit_cost}
                            onChange={(event) => updateLine(index, { unit_cost: Number(event.target.value) })}
                            className="h-9 text-right text-[12px]"
                          />
                        </label>
                        <div>
                          <span className="field-label">小计</span>
                          <div className="flex h-9 items-center justify-end text-[12px] font-medium tabular">
                            {formatMoney((Number(line.quantity) || 0) * (Number(line.unit_cost) || 0))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] px-4 py-3">
                  <div className="flex gap-4 text-[11px] text-muted-foreground">
                    <span>合计数量 <strong className="text-foreground">{formatQty(totalQuantity)}</strong></span>
                    <span>合计金额 <strong className="text-foreground">{formatMoney(totalAmount)}</strong></span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setLines((current) => [...current, {
                    sku: "", name: "", spec: "", category: "未分类", unit: "件", barcode: "",
                    quantity: 1, unit_cost: 0, reference_price: 0, confidence: 0,
                    matched_product_id: null, matched_product_name: "", match_type: "new", warnings: [],
                  }])}>
                    + 添加一行
                  </Button>
                </div>
              </div>

              <div className="app-card flex flex-wrap items-center justify-between gap-3 p-4">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={autoConfirm}
                    onChange={(event) => setAutoConfirm(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded accent-[#007AFF]"
                  />
                  <span>
                    <span className="block text-[12px] font-medium">确认后立即执行入库</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">关闭则只生成草稿，可在入库单中继续核对。</span>
                  </span>
                </label>
                <Button onClick={() => void importLines()} loading={importing} className="min-w-[150px]">
                  <CheckCircle2 className="h-4 w-4" />
                  {importing ? "正在入库…" : autoConfirm ? "确认并入库" : "生成入库草稿"}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
