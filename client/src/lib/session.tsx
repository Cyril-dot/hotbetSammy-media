import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import api, { ApiError } from "./api";

interface SessionState {
  token: string | null;
  user: Record<string, unknown> | null;
  balance: number | null;
  checked: boolean;
  refresh: () => void;
  logout: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

function numeric(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : null;
  return n !== null && Number.isFinite(n) ? n : null;
}

/**
 * Tolerant field lookup for the session's user object. Checks the given keys
 * at the top level, then digs into common wrapper shapes some backends use
 * (`user.user`, `user.data`, `user.profile`, `user.account`) in case the API
 * response wasn't unwrapped as expected. Logs the raw object once (per page
 * load) when nothing at all is found, so the actual shape can be inspected
 * in the browser console instead of guessing blind.
 */
export function pickUserField(user: Record<string, unknown> | null, ...keys: string[]): string {
  if (!user) return "";
  const tryObj = (obj: Record<string, unknown> | null | undefined): string => {
    if (!obj) return "";
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) return v;
      if (typeof v === "number") return String(v);
    }
    return "";
  };
  const direct = tryObj(user);
  if (direct) return direct;
  for (const wrapperKey of ["user", "data", "profile", "account", "result"]) {
    const nested = user[wrapperKey];
    if (nested && typeof nested === "object") {
      const found = tryObj(nested as Record<string, unknown>);
      if (found) return found;
    }
  }
  return "";
}

/**
 * Admin-tier check used to bypass user-only gates (e.g. the withdrawal gate).
 * The backend only ever sends role as one of: "ADMIN", "SUPER_ADMIN", "USER".
 * Both admin tiers should bypass the gate — only "USER" should not.
 *
 * Uses the same tolerant field lookup as pickUserField above: checks `role`
 * at the top level first, then digs into common wrapper shapes (`user.user`,
 * `user.data`, `user.profile`, `user.account`, `user.result`) in case the
 * /api/user/me response wasn't unwrapped as expected. Without this, a
 * wrapped response would leave the top-level `role` field undefined and an
 * actual admin/super_admin account would incorrectly fall through to the
 * normal user withdrawal gate.
 */
const ADMIN_ROLE_NAMES = new Set(["ADMIN", "SUPER_ADMIN"]);

export function getUserRole(user: Record<string, unknown> | null): "ADMIN" | "SUPER_ADMIN" | "USER" {
  if (!user) return "USER";
  const candidates: unknown[] = [user.role, user.userRole, user.accountRole, user.authority, user.authorities, user.roles];
  for (const wrapperKey of ["user", "data", "profile", "account", "result"]) {
    const nested = user[wrapperKey];
    if (nested && typeof nested === "object") {
      const nestedRole = getUserRole(nested as Record<string, unknown>);
      if (nestedRole !== "USER") return nestedRole;
    }
  }
  for (const candidate of candidates) {
    const values = Array.isArray(candidate) ? candidate : [candidate];
    for (const value of values) {
      const role = typeof value === "object" && value !== null
        ? String((value as Record<string, unknown>).authority ?? (value as Record<string, unknown>).role ?? "")
        : String(value ?? "");
      const normalized = role.trim().toUpperCase().replace(/^ROLE_/, "");
      if (normalized === "ADMIN" || normalized === "SUPER_ADMIN") return normalized;
    }
  }
  return "USER";
}

export function isAdminUser(user: Record<string, unknown> | null): boolean {
  return ADMIN_ROLE_NAMES.has(getUserRole(user));
}

export function isSuperAdminUser(user: Record<string, unknown> | null): boolean {
  return getUserRole(user) === "SUPER_ADMIN";
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => (typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null));
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  const load = useCallback(() => {
    const t = typeof window !== "undefined" ? window.localStorage.getItem("accessToken") : null;
    if (typeof window !== "undefined") {
      if (t) window.localStorage.setItem("fb_token", t);
      else window.localStorage.removeItem("fb_token");
    }
    setToken(t);
    if (!t) { setUser(null); setBalance(null); setChecked(true); return; }
    Promise.allSettled([api.user.me(), api.wallet.getWallet()]).then(([userRes, walletRes]) => {
      if (userRes.status === "fulfilled") {
        setUser(userRes.value.data ?? userRes.value);
        const hasName = pickUserField(userRes.value.data ?? userRes.value, "firstName", "first_name", "email", "emailAddress", "username");
        if (!hasName) {
          // eslint-disable-next-line no-console
          console.warn("[session] Logged in, but no name/email field could be found on the user object. Raw response:", userRes.value);
        }
      } else if (userRes.reason instanceof ApiError && userRes.reason.status === 401) {
        // Token is genuinely invalid/expired — clear it. A network error must NOT log the user out.
        window.localStorage.removeItem("accessToken");
        setToken(null);
        setUser(null);
      }
      if (walletRes.status === "fulfilled") {
        const payload = (walletRes.value.data ?? walletRes.value) as Record<string, unknown>;
        const raw = payload?.balance ?? payload?.availableBalance;
        setBalance(numeric(raw));
      }
      setChecked(true);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refreshing the page must not log the user out: we only re-validate silently in the background.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const logout = useCallback(() => {
    window.localStorage.removeItem("accessToken");
    api.auth.logout().catch(() => undefined);
    setToken(null);
    setUser(null);
    setBalance(null);
  }, []);

  return (
    <SessionContext.Provider value={{ token, user, balance, checked, refresh: load, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
