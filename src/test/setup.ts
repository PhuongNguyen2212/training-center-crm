// Ensure the Web Crypto API (PBKDF2, randomUUID, getRandomValues) is available
// under the jsdom test environment — jsdom doesn't ship subtle crypto.
import { webcrypto } from "node:crypto";

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}
