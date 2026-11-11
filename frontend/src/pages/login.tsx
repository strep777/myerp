import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  Check,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const FEATURES = ["实时库存与成本", "入库、出库、调拨、盘点闭环", "操作留痕与角色权限"];

const MOCK_ROWS = [
  { sku: "SKU-1001", name: "无线机械键盘", qty: "126", tone: "text-emerald-300" },
  { sku: "SKU-1004", name: "27 英寸显示器", qty: "38", tone: "text-sky-300" },
  { sku: "SKU-1007", name: "USB-C 扩展坞", qty: "8", tone: "text-amber-300" },
];

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  useDocumentTitle("登录");

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  const from = (location.state as { from?: string } | null)?.from;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const me = await login(username.trim(), password);
      toast.success(`欢迎回来，${me.display_name}`);
      navigate(from && from !== "/login" ? from : "/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mesh-bg relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8">
      <div className="login-glow-a pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full blur-2xl" />
      <div className="login-glow-b pointer-events-none absolute -bottom-40 right-0 h-[520px] w-[520px] rounded-full blur-2xl" />

      <div className="relative grid w-full max-w-[1000px] overflow-hidden rounded-[22px] border border-white/70 bg-white shadow-window lg:grid-cols-[1.08fr_1fr]">
        <section className="relative hidden min-h-[620px] flex-col overflow-hidden bg-[#0B1220] p-9 text-white lg:flex">
          <div className="pointer-events-none absolute -right-28 -top-24 h-80 w-80 rounded-full bg-[#007AFF]/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[#5E5CE6]/25 blur-3xl" />

          <div className="relative flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white/[0.12] ring-1 ring-white/15">
              <Boxes className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[14px] font-semibold tracking-[-0.01em]">Lager</p>
              <p className="text-[9px] font-medium tracking-[0.14em] text-white/40">
                仓储管理
              </p>
            </div>
          </div>

          <div className="relative mt-16 max-w-[360px]">
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/65">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              本地部署 · 数据自主可控
            </p>
            <h1 className="text-[34px] font-semibold leading-[1.18] tracking-[-0.04em]">
              让仓库的每一次
              <br />
              进出都清楚可查
            </h1>
            <p className="mt-3 text-[13px] leading-6 text-white/55">
              为中小团队准备的轻量仓库管理工具。没有复杂参数，打开就能开始工作。
            </p>
            <ul className="mt-5 space-y-2.5">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-[12px] text-white/70">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#007AFF]/25 text-[#66B2FF]">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mt-auto pt-10">
            <div className="rounded-[14px] border border-white/[0.09] bg-white/[0.055] p-3.5 backdrop-blur-md">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/55">
                  <Warehouse className="h-3 w-3" />
                  上海主仓 · 今日库存
                </div>
                <span className="flex items-center gap-1 text-[9px] text-emerald-300/90">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  实时
                </span>
              </div>
              <div className="space-y-2">
                {MOCK_ROWS.map((row) => (
                  <div key={row.sku} className="flex items-center gap-2.5 rounded-lg bg-white/[0.045] px-2.5 py-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.06] text-[10px] text-white/60">
                      {row.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-white/80">{row.name}</p>
                      <p className="text-[9px] text-white/35">{row.sku}</p>
                    </div>
                    <p className={`text-[13px] font-semibold tabular ${row.tone}`}>{row.qty}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[10px] text-white/30">
              Lager v1.1 · 为专注业务的人而设计
            </p>
          </div>
        </section>

        <section className="relative flex flex-col justify-center bg-white p-6 sm:p-9">
          <div className="mx-auto w-full max-w-[340px] pt-2">
            <div className="mb-7 flex items-center gap-2.5 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-b from-[#3399ff] to-[#007AFF] text-white shadow-sm">
                <Boxes className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="text-[14px] font-semibold">Lager</p>
                <p className="text-[10px] tracking-[0.12em] text-muted-foreground">
                  仓储管理
                </p>
              </div>
            </div>

            <h2 className="text-[24px] font-semibold tracking-[-0.03em]">登录到工作台</h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              使用管理员分配给你的账号继续。
            </p>

            <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  autoFocus
                  className="h-10"
                  disabled={submitting}
                />
              </div>
              <div>
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    className="h-10 pr-10"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground"
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {capsLock ? (
                  <p className="mt-1.5 text-[11px] text-amber-600">大写锁定已开启</p>
                ) : null}
              </div>

              {error ? (
                <div
                  role="alert"
                  className="rounded-[9px] border border-destructive/15 bg-destructive/[0.055] px-3 py-2.5 text-[12px] leading-5 text-destructive"
                >
                  {error}
                </div>
              ) : null}

              <Button type="submit" className="h-10 w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? "正在登录…" : "登录"}
                {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
              </Button>
            </form>

            <div className="mt-6 flex items-start gap-2 rounded-[9px] bg-[#F7F8FA] px-3 py-2.5">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-[11px] leading-[1.55] text-muted-foreground">
                首次部署请使用部署文档中的管理员初始账号；登录后建议立即修改密码。
                账号连续输错多次会暂时锁定。
              </p>
            </div>

            <p className="mt-8 text-center text-[10px] text-muted-foreground/70">
              Lager v1.1 · 本系统仅限授权人员使用
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
