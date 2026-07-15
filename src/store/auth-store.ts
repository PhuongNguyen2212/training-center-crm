// Auth store. In the desktop app (Tauri) it authenticates against the Rust/
// SQLite backend (bcrypt, server-side role checks, server-side lockout). In the
// browser it falls back to the localStorage prototype path (PBKDF2 + in-store
// lockout). See SECURITY.md and docs/production-backend.md.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import { verifyPassword } from "@/lib/crypto";
import { backend, hasRemoteBackend } from "@/lib/backend";
import { errorMessage } from "@/lib/error";
import { useDataStore } from "./data-store";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 5 * 60_000; // 5 minutes
export const SESSION_IDLE_MS = 30 * 60_000; // auto-logout after 30 min idle

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

interface Attempt {
  fails: number;
  lockedUntil: number; // epoch ms, 0 = not locked
}

interface AuthState {
  currentUser: User | null;
  token: string | null; // backend session token (Tauri only)
  lastActivity: number;
  attempts: Record<string, Attempt>; // browser-path lockout, keyed by email
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  touch: () => void;
  isIdleExpired: () => boolean;
  /// Call after a successful password change: the account no longer carries a
  /// default/temporary password, so the forced modal can be released.
  clearMustChangePassword: () => void;
}

async function checkCredential(user: User, password: string): Promise<boolean> {
  if (user.passwordHash && user.salt) {
    return verifyPassword(password, user.salt, user.passwordHash);
  }
  if (user.password != null) return user.password === password;
  return false;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      token: null,
      lastActivity: Date.now(),
      attempts: {},

      login: async (email, password) => {
        // ---- Desktop: real backend ----
        if (hasRemoteBackend()) {
          try {
            const { token, user } = await backend.login(email, password);
            set({ currentUser: user, token, lastActivity: Date.now() });
            await useDataStore.getState().hydrateFromBackend(token);
            return { ok: true, user };
          } catch (e) {
            return { ok: false, error: errorMessage(e) };
          }
        }

        // ---- Browser: localStorage prototype path ----
        const key = email.trim().toLowerCase();
        const now = Date.now();
        const attempt = get().attempts[key] ?? { fails: 0, lockedUntil: 0 };

        if (attempt.lockedUntil > now) {
          const mins = Math.ceil((attempt.lockedUntil - now) / 60_000);
          return {
            ok: false,
            error: `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ~${mins} phút.`,
          };
        }

        const user = useDataStore
          .getState()
          .users.find((u) => u.email.toLowerCase() === key);

        const valid = user ? await checkCredential(user, password) : false;

        if (!user || !valid) {
          const fails = attempt.fails + 1;
          const lockedUntil =
            fails >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : 0;
          set((s) => ({
            attempts: { ...s.attempts, [key]: { fails, lockedUntil } },
          }));
          if (user) {
            useDataStore
              .getState()
              .addAudit(user.id, "login.failed", `Đăng nhập sai (${fails} lần)`);
          }
          return {
            ok: false,
            error:
              lockedUntil > 0
                ? "Sai quá số lần cho phép. Tài khoản bị khóa 5 phút."
                : "Email hoặc mật khẩu không đúng.",
          };
        }

        if (user.status === "suspended") {
          useDataStore
            .getState()
            .addAudit(user.id, "login.blocked", "Tài khoản bị treo");
          return {
            ok: false,
            error: "Tài khoản đã bị treo. Liên hệ quản trị viên.",
          };
        }

        set((s) => {
          const next = { ...s.attempts };
          delete next[key];
          return { attempts: next, currentUser: user, lastActivity: now };
        });
        useDataStore.getState().addAudit(user.id, "login", "Đăng nhập hệ thống");
        return { ok: true, user };
      },

      logout: () => {
        const { token } = get();
        if (hasRemoteBackend() && token) backend.logout(token).catch(() => {});
        set({ currentUser: null, token: null });
      },

      touch: () => set({ lastActivity: Date.now() }),
      isIdleExpired: () => Date.now() - get().lastActivity > SESSION_IDLE_MS,
      clearMustChangePassword: () =>
        set((s) =>
          s.currentUser
            ? { currentUser: { ...s.currentUser, mustChangePassword: false } }
            : s,
        ),
    }),
    {
      name: "crm-auth",
      partialize: (s) => ({
        currentUser: s.currentUser,
        token: s.token,
        lastActivity: s.lastActivity,
        attempts: s.attempts,
      }),
    },
  ),
);
