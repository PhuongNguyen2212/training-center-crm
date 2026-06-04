import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore, MAX_FAILED_ATTEMPTS } from "@/store/auth-store";
import { useDataStore } from "@/store/data-store";

beforeEach(() => {
  localStorage.clear();
  useDataStore.getState().resetData();
  useAuthStore.setState({
    currentUser: null,
    attempts: {},
    lastActivity: Date.now(),
  });
});

const ADMIN = "admin@trungtam.vn";

describe("Đăng nhập & chống dò mật khẩu", () => {
  it("đăng nhập đúng thành công và set currentUser", async () => {
    const r = await useAuthStore.getState().login(ADMIN, "admin123");
    expect(r.ok).toBe(true);
    expect(useAuthStore.getState().currentUser?.email).toBe(ADMIN);
  });

  it("sai mật khẩu -> thất bại và tăng bộ đếm", async () => {
    const r = await useAuthStore.getState().login(ADMIN, "sai-roi");
    expect(r.ok).toBe(false);
    expect(useAuthStore.getState().attempts[ADMIN].fails).toBe(1);
  });

  it("BUG GUARD: khóa tài khoản sau số lần sai tối đa, kể cả khi sau đó nhập đúng", async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await useAuthStore.getState().login(ADMIN, "sai-roi");
    }
    // Mật khẩu đúng nhưng đang trong thời gian khóa.
    const r = await useAuthStore.getState().login(ADMIN, "admin123");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("khóa");
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it("BUG GUARD: tài khoản bị treo không đăng nhập được dù đúng mật khẩu", async () => {
    useDataStore.getState().setStaffStatus("u-finance", "suspended", "u-admin");
    const r = await useAuthStore.getState().login("linh.tc@trungtam.vn", "finance123");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("treo");
  });

  it("email không tồn tại -> thất bại, không lộ thông tin", async () => {
    const r = await useAuthStore.getState().login("khong-co@x.vn", "whatever");
    expect(r.ok).toBe(false);
  });
});

describe("Đổi mật khẩu (hash) + đăng nhập", () => {
  it("sau khi đổi: mật khẩu mới đăng nhập được, mật khẩu cũ thì không", async () => {
    await useDataStore.getState().changeOwnPassword("u-admin", "MatKhauMoi123");

    const bad = await useAuthStore.getState().login(ADMIN, "admin123");
    expect(bad.ok).toBe(false);

    useAuthStore.setState({ attempts: {} }); // bỏ đếm sai của lần thử trên
    const good = await useAuthStore.getState().login(ADMIN, "MatKhauMoi123");
    expect(good.ok).toBe(true);
  });
});

describe("Hết hạn phiên khi không hoạt động", () => {
  it("isIdleExpired = true khi vượt quá thời gian chờ", () => {
    useAuthStore.setState({ lastActivity: Date.now() - 31 * 60_000 });
    expect(useAuthStore.getState().isIdleExpired()).toBe(true);
  });
  it("isIdleExpired = false khi vừa hoạt động", () => {
    useAuthStore.getState().touch();
    expect(useAuthStore.getState().isIdleExpired()).toBe(false);
  });
});
