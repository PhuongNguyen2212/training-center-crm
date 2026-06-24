import { describe, expect, it } from "vitest";
import { toCsv, dateStamp, type CsvColumn } from "./csv";

interface Row {
  name: string;
  amount: number;
  note: string | null;
}

const cols: CsvColumn<Row>[] = [
  { header: "Tên", value: (r) => r.name },
  { header: "Số tiền", value: (r) => r.amount },
  { header: "Ghi chú", value: (r) => r.note },
];

describe("toCsv", () => {
  it("renders header + rows with CRLF", () => {
    const csv = toCsv([{ name: "An", amount: 100, note: "ok" }], cols);
    expect(csv).toBe("Tên,Số tiền,Ghi chú\r\nAn,100,ok");
  });

  it("returns header only for empty rows", () => {
    expect(toCsv([], cols)).toBe("Tên,Số tiền,Ghi chú");
  });

  it("quotes fields containing comma, quote or newline", () => {
    const csv = toCsv(
      [{ name: 'Bình, "Bí"', amount: 5, note: "dòng1\ndòng2" }],
      cols,
    );
    expect(csv).toBe(
      'Tên,Số tiền,Ghi chú\r\n"Bình, ""Bí""",5,"dòng1\ndòng2"',
    );
  });

  it("renders null/undefined as empty cell", () => {
    expect(toCsv([{ name: "C", amount: 0, note: null }], cols)).toBe(
      "Tên,Số tiền,Ghi chú\r\nC,0,",
    );
  });
});

describe("dateStamp", () => {
  it("formats YYYYMMDD", () => {
    expect(dateStamp(new Date("2026-06-19T10:00:00Z"))).toBe("20260619");
  });
});
