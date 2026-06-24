// CSV export helpers — Excel-friendly: UTF-8 BOM (Vietnamese hiển thị đúng),
// trường có dấu phẩy/nháy/xuống dòng được bọc nháy kép, kết thúc dòng CRLF.

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from rows + column definitions. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeCell(c.value(r))).join(","))
    .join("\r\n");
  return body ? `${head}\r\n${body}` : head;
}

/** Trigger a browser download of CSV text (with BOM so Excel reads UTF-8). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build CSV from rows + columns and download it. */
export function exportCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  downloadCsv(filename, toCsv(rows, columns));
}

/** Filesystem-safe date stamp for filenames, e.g. 20260619. */
export function dateStamp(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
