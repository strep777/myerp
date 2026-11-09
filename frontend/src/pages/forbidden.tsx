import { ArrowLeft, ShieldX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[16px] border border-black/[0.06] bg-white shadow-card">
        <ShieldX className="h-6 w-6 text-muted-foreground" strokeWidth={1.6} />
      </div>
      <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        403 · Forbidden
      </p>
      <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em]">你没有访问权限</h1>
      <p className="mt-2 max-w-[360px] text-[13px] leading-6 text-muted-foreground">
        当前账号的角色无法查看此页面。如果这是工作所需，请联系管理员调整你的角色权限。
      </p>
      <Button variant="secondary" className="mt-5" onClick={() => navigate("/")}>
        <ArrowLeft className="h-4 w-4" />
        返回工作台
      </Button>
    </div>
  );
}
