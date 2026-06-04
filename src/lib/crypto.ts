// Password hashing for the prototype, using the browser's Web Crypto (PBKDF2).
//
// This demonstrates the real shape of credential handling: a per-user random
// salt + a slow KDF, never storing the plaintext. It is NOT a substitute for
// the production model in CLAUDE.md (bcrypt 12+ rounds verified inside a Tauri
// command, server-side). A pure browser SPA cannot keep secrets from its user —
// see SECURITY.md.

const ITERATIONS = 150_000;
const KEY_LEN = 32; // bytes

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(
  password: string,
  salt: string,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LEN * 8,
  );
  return toHex(bits);
}

// Constant-ish time compare (length-checked hex strings).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const actual = await hashPassword(password, salt);
  return safeEqual(actual, expectedHash);
}

export interface PasswordStrength {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  issues: string[];
}

// Basic policy: ≥8 chars, with letters + digits; bonus for symbols/length.
export function checkPasswordStrength(pw: string): PasswordStrength {
  const issues: string[] = [];
  if (pw.length < 8) issues.push("Tối thiểu 8 ký tự");
  if (!/[a-zA-Z]/.test(pw)) issues.push("Cần ít nhất 1 chữ cái");
  if (!/[0-9]/.test(pw)) issues.push("Cần ít nhất 1 chữ số");

  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  return {
    ok: issues.length === 0,
    score: Math.min(score, 4) as PasswordStrength["score"],
    issues,
  };
}
