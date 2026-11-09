import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, type LucideIcon } from "lucide-react";
import type {
  InboundOrder,
  InboundSummary,
  OutboundOrder,
  OutboundSummary,
  TransferOrder,
  TransferSummary,
} from "@/lib/types";

export type OrderType = "inbound" | "outbound" | "transfer";
export type OrderSummary = InboundSummary | OutboundSummary | TransferSummary;
export type AnyOrder = InboundOrder | OutboundOrder | TransferOrder;

export interface OrderMeta {
  title: string;
  shortTitle: string;
  singular: string;
  description: string;
  api: string;
  path: string;
  icon: LucideIcon;
  tone: string;
  softTone: string;
  emptyTitle: string;
  newTitle: string;
}

export const ORDER_META: Record<OrderType, OrderMeta> = {
  inbound: {
    title: "入库单",
    shortTitle: "入库",
    singular: "入库单",
    description: "登记供应商到货，确认后增加指定仓库的库存与成本。",
    api: "/inbound-orders",
    path: "/inbound-orders",
    icon: ArrowDownToLine,
    tone: "text-blue-600",
    softTone: "bg-blue-50 text-blue-600",
    emptyTitle: "还没有入库单",
    newTitle: "新建入库单",
  },
  outbound: {
    title: "出库单",
    shortTitle: "出库",
    singular: "出库单",
    description: "登记向客户发货，确认后扣减指定仓库库存，库存不足会整单拒绝。",
    api: "/outbound-orders",
    path: "/outbound-orders",
    icon: ArrowUpFromLine,
    tone: "text-violet-600",
    softTone: "bg-violet-50 text-violet-600",
    emptyTitle: "还没有出库单",
    newTitle: "新建出库单",
  },
  transfer: {
    title: "调拨单",
    shortTitle: "调拨",
    singular: "调拨单",
    description: "在两个仓库之间移动库存，确认后同时记录调出与调入流水。",
    api: "/transfer-orders",
    path: "/transfer-orders",
    icon: ArrowLeftRight,
    tone: "text-teal-600",
    softTone: "bg-teal-50 text-teal-600",
    emptyTitle: "还没有调拨单",
    newTitle: "新建调拨单",
  },
};

export function orderNo(order: AnyOrder | OrderSummary): string {
  return order.order_no;
}

export function isTransfer(order: AnyOrder | OrderSummary): order is TransferOrder | TransferSummary {
  return "from_warehouse_id" in order;
}
