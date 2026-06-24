import { describe, it, expect } from "vitest";
import { isValidCccd, CCCD_PROVINCE_CODES } from "./cccd";

describe("isValidCccd", () => {
  it("accepts 12 digits with a valid province prefix", () => {
    expect(isValidCccd("012345678901")).toBe(true); // 012 = Lai Châu
    expect(isValidCccd("079123456789")).toBe(true); // 079 = TP HCM
    expect(isValidCccd("001999999999")).toBe(true); // 001 = Hà Nội
  });

  it("rejects wrong length", () => {
    expect(isValidCccd("01234567890")).toBe(false); // 11
    expect(isValidCccd("0123456789012")).toBe(false); // 13
    expect(isValidCccd("")).toBe(false);
  });

  it("rejects non-digits", () => {
    expect(isValidCccd("01234567890x")).toBe(false);
    expect(isValidCccd("012 45678901")).toBe(false);
  });

  it("rejects structurally-bogus values the bare 12-digit check would pass", () => {
    expect(isValidCccd("000000000000")).toBe(false); // 000 not a province
    expect(isValidCccd("123456789012")).toBe(false); // 123 not a province
    expect(isValidCccd("999999999999")).toBe(false); // 999 not a province
  });

  it("covers all 63 provinces", () => {
    expect(CCCD_PROVINCE_CODES.size).toBe(63);
  });
});
