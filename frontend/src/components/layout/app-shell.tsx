import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  UserRound,
  Users,
  Warehouse as WarehouseIcon,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { initials, roleLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { ChangePasswordDialog } from "@/components/layout/change-password-dialog";
import { HelpDialog } from "@/components/layout/help-dialog";
import { useGuidedTour } from "@/components/onboarding/use-guided-tour";

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  end?: boolean;
  adminOnly?: boolean;
  auditOnly?: boolean;
  writeOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "总览",
    items: [
      { label: "工作台", path: "/", icon: LayoutDashboard, end: true },
      { label: "AI 助手", path: "/ai", icon: Sparkles, writeOnly: true },
    ],
  },
  {
    label: "库存",
    items: [
      { label: "库存余额", path: "/inventory", icon: Package, end: true },
      { label: "库存流水", path: "/inventory/ledger", icon: ClipboardList },
    ],
  },
  {
    label: "业务",
    items: [
      { label: "入库单", path: "/inbound-orders", icon: Truck },
      { label: "出库单", path: "/outbound-orders", icon: Store },
      { label: "调拨单", path: "/transfer-orders", icon: ArrowLeftRight },
      { label: "盘点单", path: "/stocktakes", icon: ClipboardCheck },
    ],
  },
  {
    label: "分析",
    items: [{ label: "报表", path: "/reports", icon: FileBarChart }],
  },
  {
    label: "基础资料",
    items: [
      { label: "商品", path: "/products", icon: Boxes },
      { label: "仓库", path: "/warehouses", icon: WarehouseIcon },
      { label: "供应商", path: "/suppliers", icon: Truck },
      { label: "客户", path: "/customers", icon: Users },
    ],
  },
  {
    label: "系统",
    items: [
      { label: "用户管理", path: "/system/users", icon: UserRound, adminOnly: true },
      { label: "审计日志", path: "/system/audit-logs", icon: ShieldCheck, auditOnly: true },
      { label: "系统设置", path: "/system/settings", icon: Settings2, adminOnly: true },
      { label: "系统信息", path: "/system/info", icon: Settings },
    ],
  },
];

const TOUR_TARGETS: Record<string, string> = {
  "/": "nav-workbench",
  "/inventory": "nav-inventory",
  "/inbound-orders": "nav-business",
  "/ai": "nav-ai",
  "/system/settings": "nav-settings",
};

const BREADCRUMBS: Record<string, string[]> = {
  "/": ["工作台"],
  "/ai": ["AI 助手"],
  "/system/settings": ["系统", "系统设置"],
  "/inventory": ["库存", "库存余额"],
  "/inventory/ledger": ["库存", "库存流水"],
  "/inbound-orders": ["业务", "入库单"],
  "/outbound-orders": ["业务", "出库单"],
  "/transfer-orders": ["业务", "调拨单"],
  "/stocktakes": ["业务", "盘点单"],
  "/reports": ["报表"],
  "/products": ["基础资料", "商品"],
  "/warehouses": ["基础资料", "仓库"],
  "/suppliers": ["基础资料", "供应商"],
  "/customers": ["基础资料", "客户"],
  "/system/users": ["系统", "用户管理"],
  "/system/audit-logs": ["系统", "审计日志"],
  "/system/info": ["系统", "系统信息"],
};

function visibleGroups(isAdmin: boolean, canAudit: boolean, canWrite: boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (!item.adminOnly || isAdmin) &&
        (!item.auditOnly || canAudit) &&
        (!item.writeOnly || canWrite),
    ),
  })).filter((group) => group.items.length > 0);
}

function SidebarContent({
  collapsed,
  onNavigate,
  onAccount,
  mobile,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  onAccount?: () => void;
  mobile?: boolean;
}) {
  const { user, isAdmin, canAudit, canWriteDocs } = useAuth();
  const groups = visibleGroups(isAdmin, canAudit, canWriteDocs);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex h-[54px] shrink-0 items-center gap-2.5 px-4", collapsed && !mobile && "justify-center px-2")}>
        <div className="mac-dots shrink-0">
          <i className="mac-dot-red" />
          <i className="mac-dot-yellow" />
          <i className="mac-dot-green" />
        </div>
        {!collapsed || mobile ? (
          <div className="ml-auto flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-gradient-to-b from-[#3399ff] to-[#007AFF] shadow-[0_2px_5px_rgba(0,122,255,0.3)]">
              <Boxes className="h-4 w-4 text-white" strokeWidth={2} />
            </div>
            <div className="leading-none">
              <p className="text-[13px] font-semibold tracking-[-0.01em]">Lager 仓储</p>
              <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                Warehouse
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 pt-1.5" aria-label="主导航">
        {groups.map((group) => (
          <div key={group.label} className="mb-1.5">
            {!collapsed || mobile ? (
              <p className="mb-0.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/65">
                {group.label}
              </p>
            ) : (
              <div className="mx-2 mb-2 h-px bg-black/[0.055]" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const link = (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    data-tour={TOUR_TARGETS[item.path]}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex h-[30px] items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-all duration-150",
                        isActive
                          ? "nav-pill-active text-foreground"
                          : "text-slate-600 hover:bg-black/[0.035] hover:text-foreground",
                        collapsed && !mobile && "justify-center px-0",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={cn(
                            "h-[17px] w-[17px] shrink-0 transition-colors",
                            isActive ? "text-primary" : "text-slate-500 group-hover:text-slate-700",
                          )}
                          strokeWidth={1.75}
                        />
                        {!collapsed || mobile ? <span className="truncate">{item.label}</span> : null}
                        {isActive && (!collapsed || mobile) ? (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary/70" />
                        ) : null}
                      </>
                    )}
                  </NavLink>
                );
                return collapsed && !mobile ? (
                  <Tooltip key={item.path} content={item.label} side="right">
                    <div>{link}</div>
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn("shrink-0 border-t border-black/[0.055] px-3 py-2.5", collapsed && !mobile && "px-2")}>
        {collapsed && !mobile ? (
          <Tooltip content={`${user?.display_name || ""} · ${roleLabel(user?.role || "")}`} side="right">
            <button
              type="button"
              onClick={onAccount}
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#4AA3FF] to-[#5E5CE6] text-[11px] font-semibold text-white"
              aria-label="账户设置"
            >
              {initials(user?.display_name || user?.username || "")}
            </button>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4AA3FF] to-[#5E5CE6] text-[11px] font-semibold text-white shadow-sm">
              {initials(user?.display_name || user?.username || "")}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[12px] font-medium">{user?.display_name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{roleLabel(user?.role || "")}</p>
            </div>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="在线" />
          </div>
        )}
        <p className={cn("mt-1.5 px-1 text-[10px] text-muted-foreground/60", collapsed && !mobile && "text-center")}>
          {collapsed && !mobile ? "v1.1" : "Lager v1.1 · 本地部署"}
        </p>
      </div>
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tourDrawerOpen, setTourDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("lager_sidebar_collapsed") === "1");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const startTour = useGuidedTour({
    onPrepare: () => {
      if (window.matchMedia("(max-width: 767px)").matches) {
        setMobileOpen(false);
        setTourDrawerOpen(true);
      }
    },
    onExit: () => setTourDrawerOpen(false),
  });

  useEffect(() => {
    localStorage.setItem("lager_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const crumbs =
    BREADCRUMBS[location.pathname] ||
    (location.pathname.startsWith("/inbound-orders")
      ? ["业务", "入库单"]
      : location.pathname.startsWith("/outbound-orders")
        ? ["业务", "出库单"]
        : location.pathname.startsWith("/transfer-orders")
          ? ["业务", "调拨单"]
          : location.pathname.startsWith("/stocktakes")
            ? ["业务", "盘点单"]
            : ["Lager 仓储"]);

  const handleLogout = async () => {
    try {
      setSigningOut(true);
      await logout();
      toast.success("已安全退出");
      navigate("/login", { replace: true });
    } catch {
      toast.error("退出失败，请重试");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="flex min-h-[100dvh] bg-background">
        <aside
          className={cn(
            "sticky top-0 hidden h-[100dvh] shrink-0 border-r border-black/[0.06] glass transition-[width] duration-200 md:flex md:flex-col",
            collapsed ? "w-[72px]" : "w-[232px]",
          )}
        >
          <SidebarContent collapsed={collapsed} onAccount={() => setPasswordOpen(true)} />
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            className="absolute -right-2.5 top-[74px] z-20 hidden h-5 w-5 items-center justify-center rounded-full border border-black/[0.09] bg-white text-muted-foreground shadow-sm transition-colors hover:text-foreground md:flex"
          >
            <span className={cn("text-[9px] transition-transform", collapsed ? "" : "rotate-180")}>◀</span>
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-black/[0.06] glass px-4 sm:px-6 lg:px-8">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="打开导航"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
              {crumbs.map((crumb, index) => (
                <span key={`${crumb}-${index}`} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 ? <span className="text-muted-foreground/40">/</span> : null}
                  <span
                    className={cn(
                      "truncate",
                      index === crumbs.length - 1
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {crumb}
                  </span>
                </span>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1">
              <Tooltip content="新手指引">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startTour}
                  data-tour="tour-button"
                  aria-label="新手指引"
                  className="h-8 gap-1.5 px-2 text-[11px] text-muted-foreground"
                >
                  <Sparkles className="h-[15px] w-[15px]" />
                  <span className="hidden lg:inline">新手指引</span>
                </Button>
              </Tooltip>

              <Tooltip content="快捷键与帮助">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setHelpOpen(true)}
                  data-tour="help"
                  aria-label="帮助"
                  className="text-muted-foreground"
                >
                  <HelpCircle className="h-[18px] w-[18px]" />
                </Button>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ml-0.5 flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="用户菜单"
                  >
                    <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#4AA3FF] to-[#5E5CE6] text-[10px] font-semibold text-white">
                      {initials(user?.display_name || user?.username || "")}
                      {user?.must_change_password ? (
                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-amber-400" />
                      ) : null}
                    </span>
                    <span className="hidden max-w-[110px] truncate text-[12px] font-medium sm:block">
                      {user?.display_name}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[220px]">
                  <DropdownMenuLabel className="px-2.5 py-2">
                    <p className="text-[13px] font-medium text-foreground">{user?.display_name}</p>
                    <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                      @{user?.username} · {roleLabel(user?.role || "")}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
                    <KeyRound />
                    修改密码
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setHelpOpen(true)}>
                    <HelpCircle />
                    使用帮助
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem danger disabled={signingOut} onSelect={() => void handleLogout()}>
                    <LogOut />
                    {signingOut ? "正在退出…" : "退出登录"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1440px] page-enter">
              <Outlet />
            </div>
          </main>
        </div>

        {tourDrawerOpen ? (
          <div className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[82vw] flex-col border-r border-black/[0.08] bg-white shadow-window md:hidden">
            <div className="relative h-full">
              <SidebarContent collapsed={false} mobile onNavigate={() => undefined} />
            </div>
          </div>
        ) : null}

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogContent
            showClose={false}
            className="left-0 top-0 h-[100dvh] max-h-none w-[280px] max-w-[82vw] translate-x-0 translate-y-0 rounded-none border-0 p-0 data-[state=open]:animate-slide-in-left sm:max-w-[280px]"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>导航</DialogTitle>
            </DialogHeader>
            <div className="relative h-full bg-white">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.04] text-muted-foreground"
                aria-label="关闭导航"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} mobile />
            </div>
          </DialogContent>
        </Dialog>

        <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
        <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </TooltipProvider>
  );
}
