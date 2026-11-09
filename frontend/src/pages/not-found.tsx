import { ArrowLeft, SearchX } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="mesh-bg flex min-h-[100dvh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-white/70 bg-white shadow-card">
        <SearchX className="h-7 w-7 text-muted-foreground" strokeWidth={1.6} />
      </div>
      <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        404 · Not Found
      </p>
      <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.025em]">页面走丢了</h1>
      <p className="mt-2 max-w-[340px] text-[13px] leading-6 text-muted-foreground">
        这个地址不存在，或者页面已经被移动。回到工作台继续处理今天的单据吧。
      </p>
      <Button asChild className="mt-5">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" />
          返回工作台
        </Link>
      </Button>
    </div>
  );
}
