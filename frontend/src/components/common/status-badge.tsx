import { cn } from "@/lib/utils";
import { STATUS_STYLES, statusLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge className={cn("border-0", STATUS_STYLES[status] || STATUS_STYLES.DRAFT, className)}>
      {statusLabel(status)}
    </Badge>
  );
}
