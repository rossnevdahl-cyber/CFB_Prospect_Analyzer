import Papa from "papaparse";

/** Parses CSV text into rows keyed by lower-cased, underscore-normalized headers. */
export function parseCsv(text: string): Record<string, string>[] {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
  });
  return res.data;
}

export function firstOf(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

export function toNumber(v: string | undefined): number | null {
  if (v == null) return null;
  const t = String(v).replace(/[%,$]/g, "").trim();
  if (t === "" || t.toUpperCase() === "NA") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type CsvIssue = { line: number; message: string };
