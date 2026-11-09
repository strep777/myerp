import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import type { Role, User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
  hasRole: (...roles: Role[]) => boolean;
  canWriteDocs: boolean;
  canManageMaster: boolean;
  canAdjust: boolean;
  canAudit: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("lager:unauthorized", onUnauthorized);
    return () => window.removeEventListener("lager:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const me = await api.post<User>("/auth/login", { username, password });
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post<void>("/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
    [user],
  );

  const value = useMemo<AuthContextValue>(() => {
    const role = user?.role;
    return {
      user,
      loading,
      login,
      logout,
      refresh,
      setUser,
      hasRole,
      canWriteDocs: role === "ADMIN" || role === "MANAGER" || role === "OPERATOR",
      canManageMaster: role === "ADMIN" || role === "MANAGER",
      canAdjust: role === "ADMIN" || role === "MANAGER",
      canAudit: role === "ADMIN" || role === "MANAGER",
      isAdmin: role === "ADMIN",
    };
  }, [user, loading, login, logout, refresh, hasRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
