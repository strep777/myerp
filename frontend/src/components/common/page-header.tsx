import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: boolean | string;
  eyebrow?: string;
  className?: string;
}

export function PageHeader({ title, description, actions, back, eyebrow, className }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <div className="flex items-start gap-2.5">
          {back ? (
            <button
              type="button"
              aria-label="返回"
              onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
              className="-ml-1 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="truncate text-[24px] font-semibold leading-8 tracking-[-0.025em]">{title}</h1>
            {description ? (
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
