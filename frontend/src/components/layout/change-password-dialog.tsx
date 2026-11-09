import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground"
        aria-label={visible ? "隐藏密码" : "显示密码"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const validate = () => {
    if (!oldPassword) return "请输入当前密码";
    if (newPassword.length < 8) return "新密码至少需要 8 个字符";
    if (newPassword.length > 64) return "新密码不能超过 64 个字符";
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return "新密码需要同时包含字母和数字";
    }
    if (user && newPassword.toLowerCase().includes(user.username.toLowerCase())) {
      return "新密码不能包含用户名";
    }
    if (newPassword !== confirmPassword) return "两次输入的新密码不一致";
    if (newPassword === oldPassword) return "新密码不能与当前密码相同";
    return null;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post<void>("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      onOpenChange(false);
      setUser(null);
      toast.success("密码已更新，请使用新密码重新登录");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "密码修改失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent size="sm">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-primary">
              <KeyRound className="h-[18px] w-[18px]" />
            </div>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>
              更新后所有已登录设备将退出，需要使用新密码重新登录。
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4 py-2">
            <div>
              <Label htmlFor="current-password">当前密码</Label>
              <PasswordInput
                id="current-password"
                value={oldPassword}
                onChange={setOldPassword}
                placeholder="输入当前密码"
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label htmlFor="new-password">新密码</Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="至少 8 位，包含字母和数字"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">确认新密码</Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="再次输入新密码"
                autoComplete="new-password"
              />
            </div>
            {error ? (
              <p className="rounded-lg bg-destructive/[0.06] px-3 py-2 text-[12px] text-destructive">
                {error}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" loading={submitting}>
              更新密码
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
