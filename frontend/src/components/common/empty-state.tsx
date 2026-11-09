import { type LucideIcon, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-5 py-10" : "px-6 py-16",
        className,
      )}
    >
      <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl border border-black/[0.06] bg-white shadow-sm">
        <Icon className="h-5 w-5 text-slate-400" strokeWidth={1.7} />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[12px] leading-5 text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 ring-1 ring-red-100">
        <AlertCircle className="h-5 w-5 text-red-500" strokeWidth={1.7} />
      </div>
      <p className="text-sm font-medium">加载失败</p>
      <p className="mt-1 max-w-sm text-[12px] leading-5 text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="table-shell overflow-hidden">
      <div className="min-w-[720px]">
        <div className="flex h-10 items-center gap-4 border-b border-black/[0.06] bg-[#fbfbfc] px-4">
          {Array.from({ length: columns }).map((_, index) => (
            <div key={index} className="h-2.5 flex-1 animate-pulse rounded-full bg-slate-200/60" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex h-12 items-center gap-4 border-b border-black/[0.04] px-4 last:border-0">
            {Array.from({ length: columns }).map((_, col) => (
              <div key={col} className="h-2.5 flex-1 animate-pulse rounded-full bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
