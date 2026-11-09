import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

interface BulkDeleteDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: T[];
  entityLabel: string;
  getPath: (row: T) => string;
  getLabel: (row: T) => string;
  description?: ReactNode;
  onDone: () => void;
}

/**
 * 顺序删除选中的记录，避免 SQLite 并发写锁。
 * 删除失败的项目保留，原因汇总到 toast，方便用户逐条处理。
 */
export function BulkDeleteDialog<T>({
  open,
  onOpenChange,
  rows,
  entityLabel,
  getPath,
  getLabel,
  description,
  onDone,
}: BulkDeleteDialogProps<T>) {
  const [loading, setLoading] = useState(false);

  const confirm = async () => {
    if (!rows.length) return;
    setLoading(true);
    let deleted = 0;
    const failed: { label: string; message: string }[] = [];

    for (const row of rows) {
      try {
        await api.delete(getPath(row));
        deleted += 1;
      } catch (error) {
        failed.push({
          label: getLabel(row),
          message: error instanceof ApiError ? error.message : "删除失败，请稍后重试",
        });
      }
    }

    setLoading(false);
    onOpenChange(false);
    onDone();

    if (failed.length === 0) {
      toast.success(`已清除 ${deleted} 项${entityLabel}`);
      return;
    }

    const details = failed
      .slice(0, 4)
      .map((item) => `${item.label}：${item.message}`)
      .join("\n");
    toast.error(`已清除 ${deleted} 项，${failed.length} 项未删除`, {
      description: failed.length > 4 ? `${details}\n…` : details,
      duration: 8000,
    });
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`清除 ${rows.length} 项${entityLabel}？`}
      description={
        description ??
        "将永久删除选中的数据，删除后不可恢复。有库存、被单据引用或状态不允许的记录会保留，并在结果中说明原因。"
      }
      confirmLabel="清除数据"
      destructive
      loading={loading}
      onConfirm={confirm}
    />
  );
}
