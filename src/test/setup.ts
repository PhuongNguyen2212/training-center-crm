// Tests exercise the localStorage prototype path, so the HTTP API server must
// be "off" regardless of any VITE_API_URL in .env → hasRemoteBackend() stays false.
import { vi } from "vitest";
vi.stubEnv("VITE_API_URL", "");

// Ensure the Web Crypto API (PBKDF2, randomUUID, getRandomValues) is available
// under the jsdom test environment — jsdom doesn't ship subtle crypto.
import { webcrypto } from "node:crypto";

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}
