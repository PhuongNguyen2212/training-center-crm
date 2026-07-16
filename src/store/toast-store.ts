import { create } from "zustand";
import { errorMessage } from "@/lib/error";

// Global toast queue. Any write action that fails against the backend surfaces
// its error here instead of being silently swallowed (senior-review finding H2).

export type ToastKind = "error" | "success";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

const AUTO_DISMISS_MS = 6_000;
let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (message, kind = "error") => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      AUTO_DISMISS_MS,
    );
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Run a write action; on failure show the server's message as an error toast.
 *  Usage: `onClick={() => notify(markAttendance(...))}` — one call site pattern
 *  for every fire-and-forget mutation. */
export const notify = (p: Promise<unknown>): void => {
  p.catch((e) => useToastStore.getState().push(errorMessage(e), "error"));
};

/** For explicit try/catch blocks: show the failure as an error toast. */
export const toastError = (e: unknown): void =>
  useToastStore.getState().push(errorMessage(e), "error");
