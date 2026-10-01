import type { FeatureDef } from "./grading";
import { formatHeight } from "./metrics";

export { formatHeight };

export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-US");
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtAge(v: number | null | undefined): string {
  return v == null ? "—" : v.toFixed(1);
}

export function fmtFeature(v: number | null | undefined, format: FeatureDef["format"]): string {
  switch (format) {
    case "pct":
      return fmtPct(v);
    case "int":
      return fmtInt(v);
    case "age":
      return fmtAge(v);
    case "num1":
      return fmtNum(v, 1);
    case "num3":
      return fmtNum(v, 3);
    default:
      return fmtNum(v, 2);
  }
}

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return withTime
    ? d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function ordinalRound(r: number | null | undefined): string {
  if (r == null) return "—";
  return `Round ${r}`;
}
