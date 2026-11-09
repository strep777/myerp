import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Boxes } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { Role } from "@/lib/types";
import { ForbiddenPage } from "@/pages/forbidden";

function FullPageLoader() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background">
      <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-gradient-to-b from-[#3399ff] to-[#007AFF] text-white shadow-[0_8px_24px_-8px_rgba(0,122,255,0.55)]">
        <Boxes className="h-5 w-5" />
      </div>
      <div className="h-1 w-28 overflow-hidden rounded-full bg-black/[0.06]">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/60" />
      </div>
      <p className="text-[12px] text-muted-foreground">正在准备工作台…</p>
    </div>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <ForbiddenPage />;
  return <>{children}</>;
}
