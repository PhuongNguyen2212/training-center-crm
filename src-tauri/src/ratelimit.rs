// Fixed-window rate limiter, keyed by client IP. Dependency-free and in-memory,
// mirroring the LoginGuard style: good enough for a single-instance API server.
// (If the server ever scales horizontally, swap for a shared store.)

use crate::util::now_ms;
use parking_lot::Mutex;
use std::collections::HashMap;

/// Requests allowed per key per window.
pub const MAX_REQUESTS_PER_WINDOW: u32 = 300;
/// Window length (1 minute).
pub const WINDOW_MS: i64 = 60_000;
/// When the table grows past this, stale windows are swept out.
const SWEEP_THRESHOLD: usize = 1024;

struct Window {
    started_ms: i64,
    count: u32,
}

pub struct RateLimiter {
    max: u32,
    window_ms: i64,
    windows: Mutex<HashMap<String, Window>>,
}

impl RateLimiter {
    pub fn new(max: u32, window_ms: i64) -> Self {
        RateLimiter {
            max,
            window_ms,
            windows: Mutex::new(HashMap::new()),
        }
    }

    /// Record one request for `key`. Returns `true` when allowed, `false` when
    /// the key has exhausted its budget for the current window.
    pub fn check(&self, key: &str) -> bool {
        let now = now_ms();
        let mut map = self.windows.lock();

        // Keep the table bounded: drop windows that have already elapsed.
        if map.len() > SWEEP_THRESHOLD {
            map.retain(|_, w| now - w.started_ms < self.window_ms);
        }

        let w = map.entry(key.to_string()).or_insert(Window {
            started_ms: now,
            count: 0,
        });
        if now - w.started_ms >= self.window_ms {
            w.started_ms = now;
            w.count = 0;
        }
        w.count += 1;
        w.count <= self.max
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        RateLimiter::new(MAX_REQUESTS_PER_WINDOW, WINDOW_MS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_up_to_the_limit_then_blocks() {
        let rl = RateLimiter::new(3, 60_000);
        assert!(rl.check("1.2.3.4"));
        assert!(rl.check("1.2.3.4"));
        assert!(rl.check("1.2.3.4"));
        assert!(!rl.check("1.2.3.4"), "4th request in the window is blocked");
    }

    #[test]
    fn keys_are_isolated() {
        let rl = RateLimiter::new(1, 60_000);
        assert!(rl.check("a"));
        assert!(!rl.check("a"));
        assert!(rl.check("b"), "a's exhaustion must not affect b");
    }

    #[test]
    fn window_reset_restores_budget() {
        let rl = RateLimiter::new(1, 60_000);
        assert!(rl.check("a"));
        assert!(!rl.check("a"));
        // Backdate the window past its length → next check starts a fresh one.
        rl.windows.lock().get_mut("a").unwrap().started_ms -= 61_000;
        assert!(rl.check("a"));
    }
}
