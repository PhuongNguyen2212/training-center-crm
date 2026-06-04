import { describe, it, expect } from "vitest";
import {
  checkPasswordStrength,
  hashPassword,
  randomSalt,
  verifyPassword,
} from "@/lib/crypto";

describe("Băm mật khẩu (PBKDF2)", () => {
  it("không lưu plaintext — hash là chuỗi hex 64 ký tự, khác mật khẩu", async () => {
    const salt = randomSalt();
    const h = await hashPassword("MatKhau123", salt);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("MatKhau123");
  });

  it("cùng (mật khẩu, salt) -> cùng hash; salt khác -> hash khác", async () => {
    const salt = randomSalt();
    const a = await hashPassword("abc12345", salt);
    const b = await hashPassword("abc12345", salt);
    const c = await hashPassword("abc12345", randomSalt());
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("verify đúng trả true, sai trả false", async () => {
    const salt = randomSalt();
    const h = await hashPassword("secret99", salt);
    expect(await verifyPassword("secret99", salt, h)).toBe(true);
    expect(await verifyPassword("wrong-pass", salt, h)).toBe(false);
  });

  it("salt ngẫu nhiên không trùng nhau", () => {
    const s = new Set(Array.from({ length: 50 }, () => randomSalt()));
    expect(s.size).toBe(50);
  });
});

describe("Chính sách độ mạnh mật khẩu", () => {
  it("từ chối quá ngắn", () => {
    expect(checkPasswordStrength("a1").ok).toBe(false);
  });
  it("từ chối khi thiếu chữ số", () => {
    expect(checkPasswordStrength("password").ok).toBe(false);
  });
  it("từ chối khi thiếu chữ cái", () => {
    expect(checkPasswordStrength("12345678").ok).toBe(false);
  });
  it("chấp nhận mật khẩu đạt yêu cầu", () => {
    expect(checkPasswordStrength("abcd1234").ok).toBe(true);
  });
  it("điểm cao hơn cho mật khẩu dài + ký tự đặc biệt", () => {
    expect(checkPasswordStrength("Abcd1234!@#$").score).toBe(4);
  });
});
