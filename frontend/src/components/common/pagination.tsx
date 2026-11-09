import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

function pageNumbers(current: number, pages: number): Array<number | "…"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const values: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pages - 1, current + 1);
  if (start > 2) values.push("…");
  for (let page = start; page <= end; page += 1) values.push(page);
  if (end < pages - 1) values.push("…");
  values.push(pages);
  return values;
}

export function Pagination({
  total,
  page,
  pageSize,
  pages,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  if (total === 0) return null;
  return (
    <div
      className={cn(
        "mt-3 flex flex-col gap-3 px-1 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span>共 {total.toLocaleString("zh-CN")} 条</span>
        {onPageSizeChange ? (
          <span className="flex items-center gap-1.5">
            每页
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
              options={[20, 50, 100].map((size) => ({ value: String(size), label: String(size) }))}
              className="h-7 w-[66px] rounded-md px-2 text-[12px]"
            />
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="hidden items-center gap-0.5 sm:flex">
          {pageNumbers(page, pages).map((value, index) =>
            value === "…" ? (
              <span key={`ellipsis-${index}`} className="px-1.5">
                …
              </span>
            ) : (
              <Button
                key={value}
                variant={value === page ? "default" : "ghost"}
                size="icon-sm"
                className={value === page ? "" : "text-muted-foreground"}
                onClick={() => onPageChange(value)}
                aria-current={value === page ? "page" : undefined}
              >
                {value}
              </Button>
            ),
          )}
        </div>
        <span className="px-2 sm:hidden">
          {page} / {pages || 1}
        </span>
        <Button
          variant="secondary"
          size="icon-sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
