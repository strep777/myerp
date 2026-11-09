export type Role = "ADMIN" | "MANAGER" | "OPERATOR" | "VIEWER";
export type DocStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";
export type StocktakeStatus = "DRAFT" | "COUNTING" | "COMPLETED" | "CANCELLED";

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  spec: string;
  unit: string;
  barcode: string | null;
  safety_stock: number;
  reference_cost: number;
  reference_price: number;
  remark: string;
  is_active: boolean;
  total_quantity: number;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductStockClearResult {
  product_id: number;
  cleared_warehouses: number;
  cleared_quantity: number;
}

export interface ProductOption {
  id: number;
  sku: string;
  name: string;
  unit: string;
  spec: string;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  location: string;
  manager: string;
  remark: string;
  is_active: boolean;
  sku_count: number;
  total_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface WarehouseOption {
  id: number;
  code: string;
  name: string;
}

export interface Partner {
  id: number;
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  remark: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerOption {
  id: number;
  code: string;
  name: string;
}

export interface Balance {
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  category: string;
  warehouse_id: number;
  warehouse_name: string;
  quantity: number;
  avg_cost: number;
  stock_value: number;
  safety_stock: number;
  is_low: boolean;
  updated_at: string;
}

export interface LedgerEntry {
  id: number;
  product_id: number;
  sku: string;
  product_name: string;
  warehouse_id: number;
  warehouse_name: string;
  movement_type: string;
  change_qty: number;
  unit_cost: number;
  balance_after: number;
  ref_type: string;
  ref_id: number | null;
  ref_no: string;
  remark: string;
  created_by_name: string;
  created_at: string;
}

export interface InventoryOverview {
  sku_count: number;
  total_quantity: number;
  total_value: number;
  low_stock_count: number;
  warehouse_count: number;
}

export interface AdjustmentResult {
  product_id: number;
  sku: string;
  product_name: string;
  warehouse_id: number;
  warehouse_name: string;
  quantity: number;
  avg_cost: number;
  change_qty: number;
  ledger_id: number;
}

export interface InboundLine {
  id: number;
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  amount: number;
  remark: string;
}

export interface InboundOrder {
  id: number;
  order_no: string;
  status: DocStatus;
  supplier_id: number | null;
  supplier_name: string;
  warehouse_id: number;
  warehouse_name: string;
  related_no: string;
  expected_date: string | null;
  remark: string;
  total_quantity: number;
  total_amount: number;
  created_by: number;
  created_by_name: string;
  confirmed_by: number | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  lines: InboundLine[];
}

export interface InboundSummary {
  id: number;
  order_no: string;
  status: DocStatus;
  supplier_id: number | null;
  supplier_name: string;
  warehouse_id: number;
  warehouse_name: string;
  related_no: string;
  expected_date: string | null;
  total_quantity: number;
  total_amount: number;
  line_count: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface OutboundLine {
  id: number;
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  remark: string;
}

export interface OutboundOrder {
  id: number;
  order_no: string;
  status: DocStatus;
  customer_id: number | null;
  customer_name: string;
  warehouse_id: number;
  warehouse_name: string;
  related_no: string;
  expected_date: string | null;
  remark: string;
  total_quantity: number;
  created_by: number;
  created_by_name: string;
  confirmed_by: number | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  lines: OutboundLine[];
}

export interface OutboundSummary {
  id: number;
  order_no: string;
  status: DocStatus;
  customer_id: number | null;
  customer_name: string;
  warehouse_id: number;
  warehouse_name: string;
  related_no: string;
  expected_date: string | null;
  total_quantity: number;
  line_count: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface TransferLine {
  id: number;
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  remark: string;
}

export interface TransferOrder {
  id: number;
  order_no: string;
  status: DocStatus;
  from_warehouse_id: number;
  from_warehouse_name: string;
  to_warehouse_id: number;
  to_warehouse_name: string;
  remark: string;
  total_quantity: number;
  created_by: number;
  created_by_name: string;
  confirmed_by: number | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  lines: TransferLine[];
}

export interface TransferSummary {
  id: number;
  order_no: string;
  status: DocStatus;
  from_warehouse_id: number;
  from_warehouse_name: string;
  to_warehouse_id: number;
  to_warehouse_name: string;
  total_quantity: number;
  line_count: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface StocktakeLine {
  id: number;
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  book_quantity: number;
  counted_quantity: number;
  difference_quantity: number;
  remark: string;
}

export interface Stocktake {
  id: number;
  stocktake_no: string;
  warehouse_id: number;
  warehouse_name: string;
  status: StocktakeStatus;
  remark: string;
  created_by: number;
  created_by_name: string;
  completed_by: number | null;
  completed_by_name: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  line_count: number;
  difference_line_count: number;
  total_difference_quantity: number;
  lines: StocktakeLine[];
}

export interface StocktakeSummary {
  id: number;
  stocktake_no: string;
  warehouse_id: number;
  warehouse_name: string;
  status: StocktakeStatus;
  line_count: number;
  difference_line_count: number;
  total_difference_quantity: number;
  created_by_name: string;
  completed_at: string | null;
  created_at: string;
}

export interface DashboardSummary {
  product_count: number;
  warehouse_count: number;
  total_quantity: number;
  total_value: number;
  low_stock_count: number;
  draft_documents: number;
  today_inbound: number;
  today_outbound: number;
}

export interface TrendItem {
  date: string;
  inbound_qty: number;
  outbound_qty: number;
}

export interface RecentDocument {
  type: "INBOUND" | "OUTBOUND" | "TRANSFER";
  id: number;
  no: string;
  status: DocStatus;
  warehouse_name: string;
  quantity: number;
  created_at: string;
}

export interface LowStockItem extends Balance {
  shortage: number;
  recommended_qty: number;
}

export interface StockReport extends Balance {
  updated_at: string;
}

export interface FlowSummary {
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  opening_qty: number;
  inbound_qty: number;
  outbound_qty: number;
  adjust_qty: number;
  closing_qty: number;
  closing_value: number;
}

export interface StockReportPage extends Page<StockReport> {
  total_value: number;
}

export interface FlowSummaryPage extends Page<FlowSummary> {
  date_from: string;
  date_to: string;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  username: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  entity_no: string;
  summary: string;
  ip: string;
  created_at: string;
}

export interface SystemInfo {
  name: string;
  version: string;
  timezone: string;
  database: string;
  user_count: number;
  uptime_seconds: number;
}

export interface ApiErrorBody {
  detail: string;
  code: string;
  fields?: Record<string, string>;
  request_id?: string;
}

export interface InsufficientLine {
  product_id?: number;
  sku: string;
  product_name: string;
  requested: number;
  available: number;
}

export type AiProvider = "DEEPSEEK" | "OLLAMA";

export interface AiSettings {
  provider: AiProvider;
  deepseek_base_url: string;
  deepseek_model: string;
  deepseek_api_key_set: boolean;
  deepseek_api_key_hint: string;
  ollama_base_url: string;
  ollama_model: string;
  default_prompt: string;
  default_prompt_template: string;
  auto_confirm: boolean;
  prompt_version: string;
  updated_at: string | null;
}

export interface AiSettingsUpdate {
  provider: AiProvider;
  deepseek_base_url: string;
  deepseek_model: string;
  deepseek_api_key?: string;
  clear_deepseek_api_key?: boolean;
  ollama_base_url: string;
  ollama_model: string;
  default_prompt: string;
  auto_confirm: boolean;
}

export interface AiTestResult {
  ok: boolean;
  provider: string;
  model: string;
  model_available: boolean;
  models?: string[];
  reply?: string;
  latency_ms: number;
  message: string;
}

export interface OllamaModel {
  name: string;
  size?: number | null;
  modified_at?: string | null;
  details?: Record<string, unknown>;
}

export interface OllamaModelList {
  base_url: string;
  models: OllamaModel[];
}

export interface AiLinePreview {
  sku: string;
  name: string;
  spec: string;
  category: string;
  unit: string;
  barcode: string;
  quantity: number;
  unit_cost: number;
  reference_price: number;
  confidence: number;
  matched_product_id: number | null;
  matched_product_name: string;
  match_type: "existing" | "new";
  warnings: string[];
}

export interface AiAnalyzeResult {
  token: string;
  source_type: string;
  source_summary: string;
  provider: string;
  model: string;
  prompt_version: string;
  latency_ms: number;
  supplier_name: string;
  order_date: string | null;
  related_no: string;
  items: AiLinePreview[];
  warnings: string[];
}

export interface AiImportLine {
  product_id?: number | null;
  sku: string;
  name: string;
  spec: string;
  category: string;
  unit: string;
  barcode: string;
  quantity: number;
  unit_cost: number;
  reference_price: number;
  remark?: string;
}

export interface AiImportResult {
  order_id: number;
  order_no: string;
  status: string;
  created_products: string[];
  matched_products: number;
  total_quantity: number;
  total_amount: number;
  auto_confirmed: boolean;
  message: string;
}
