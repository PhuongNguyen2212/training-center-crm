import { useEffect, useRef } from "react";
import { useAuthStore, SESSION_IDLE_MS } from "@/store/auth-store";

// Logs the user out after SESSION_IDLE_MS of no interaction. User activity
// (mouse / keyboard / touch) resets the idle timer, throttled to once per 30s.
export function useSessionTimeout(onExpire: () => void) {
  const touch = useAuthStore((s) => s.touch);
  const lastTouch = useRef(0);

  useEffect(() => {
    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouch.current > 30_000) {
        lastTouch.current = now;
        touch();
      }
    };
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const interval = setInterval(() => {
      if (useAuthStore.getState().isIdleExpired()) {
        useAuthStore.getState().logout();
        onExpire();
      }
    }, 15_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(interval);
    };
  }, [touch, onExpire]);

  return SESSION_IDLE_MS;
}
