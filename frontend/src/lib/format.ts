import type { DocStatus, Role, StocktakeStatus } from "./types";

const TZ = "Asia/Shanghai";

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatSignedQty(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${formatQty(Math.abs(value))}`;
}

export function formatMoney(value: number | null | undefined, withSymbol = true): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const text = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return withSymbol ? `¥${text}` : text;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00+08:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatShortDate(value: string): string {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return "—";
  const diff = Date.now() - date;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return formatDate(value);
}

export function todayLocal(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function monthStartLocal(): string {
  return `${todayLocal().slice(0, 7)}-01`;
}

export function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function longDate(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  COUNTING: "盘点中",
  CONFIRMED: "已确认",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-200/70",
  COUNTING: "bg-amber-50 text-amber-700 ring-amber-200/70",
  CONFIRMED: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  CANCELLED: "bg-slate-100 text-slate-500 ring-slate-200/70 line-through decoration-slate-300",
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "管理员",
  MANAGER: "经理",
  OPERATOR: "操作员",
  VIEWER: "只读用户",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "全部权限，包括用户与系统管理",
  MANAGER: "业务与基础资料管理，不含用户管理",
  OPERATOR: "出入库、调拨与盘点操作",
  VIEWER: "仅查看数据与报表",
};

export const MOVEMENT_LABELS: Record<string, string> = {
  INBOUND: "采购入库",
  OUTBOUND: "销售出库",
  TRANSFER_IN: "调拨入库",
  TRANSFER_OUT: "调拨出库",
  ADJUSTMENT: "库存调整",
  STOCKTAKE_GAIN: "盘盈",
  STOCKTAKE_LOSS: "盘亏",
};

export const MOVEMENT_OPTIONS = Object.entries(MOVEMENT_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const DOC_TYPES = {
  INBOUND: { label: "入库单", path: "/inbound-orders", tone: "text-blue-600 bg-blue-50" },
  OUTBOUND: { label: "出库单", path: "/outbound-orders", tone: "text-violet-600 bg-violet-50" },
  TRANSFER: { label: "调拨单", path: "/transfer-orders", tone: "text-teal-600 bg-teal-50" },
} as const;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: "登录",
  LOGIN_FAILED: "登录失败",
  LOGOUT: "退出",
  CREATE: "创建",
  UPDATE: "修改",
  DELETE: "删除",
  CONFIRM: "确认",
  CANCEL: "取消",
  COMPLETE: "完成",
  ADJUST: "库存调整",
  RESET_PASSWORD: "重置密码",
  CHANGE_PASSWORD: "修改密码",
  PASSWORD_CHANGE: "修改密码",
};

export function statusLabel(status: DocStatus | StocktakeStatus | string): string {
  return STATUS_LABELS[status] || status;
}

export function roleLabel(role: Role | string): string {
  return ROLE_LABELS[role as Role] || role;
}

export function movementLabel(type: string): string {
  return MOVEMENT_LABELS[type] || type;
}

export function initials(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const chars = Array.from(trimmed);
  return chars.slice(0, 2).join("").toUpperCase();
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

export function parseNumber(value: string): number {
  const normalized = value.replace(/[,，\s]/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
