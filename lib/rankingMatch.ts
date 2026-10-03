import { nameSimilarity, normalizeName, normalizeSchool } from "./names";
import { CLASS_LABELS, normalizePosition } from "./types";

export type RosterRef = { cfbdId: string; name: string; nameNorm: string; team: string; position: string | null; classYear: number | null; season: number };

export type Candidate = { cfbdId: string; label: string };

export type MatchResult =
  | { status: "matched"; cfbdId: string; label: string; fuzzy: boolean; candidates: Candidate[] }
  | { status: "ambiguous"; candidates: Candidate[] }
  | { status: "none"; candidates: Candidate[] };

export function rosterLabel(r: RosterRef): string {
  const cls = r.classYear != null ? (CLASS_LABELS[r.classYear] ?? `Yr ${r.classYear}`) : "";
  return [r.name, r.position, r.team, cls && `${cls} (${r.season})`].filter(Boolean).join(" · ");
}

/** Newest roster row per player. */
function latestPerPlayer(roster: RosterRef[]): RosterRef[] {
  const m = new Map<string, RosterRef>();
  for (const r of roster) {
    const prev = m.get(r.cfbdId);
    if (!prev || r.season > prev.season) m.set(r.cfbdId, r);
  }
  return [...m.values()];
}

/**
 * Resolves one ranking row against roster candidates. Exact normalized names are narrowed by school
 * and then position; with no exact name, a close spelling at the same school and position is
 * accepted but flagged as fuzzy. Anything else is left for the user to pick in the preview.
 */
export function resolveMatch(row: { name: string; school: string | null; position: string | null }, roster: RosterRef[]): MatchResult {
  const players = latestPerPlayer(roster);
  const n = normalizeName(row.name);
  const school = normalizeSchool(row.school);
  const pos = normalizePosition(row.position);
  const label = (r: RosterRef) => ({ cfbdId: r.cfbdId, label: rosterLabel(r) });
  const sameSchool = (r: RosterRef) => !school || normalizeSchool(r.team) === school;
  const samePos = (r: RosterRef) => !pos || normalizePosition(r.position) === pos;

  let hits = players.filter((r) => r.nameNorm === n);
  if (hits.length) {
    if (school && hits.some(sameSchool)) hits = hits.filter(sameSchool);
    if (hits.length > 1 && pos && hits.some(samePos)) hits = hits.filter(samePos);
    if (hits.length === 1) return { status: "matched", cfbdId: hits[0].cfbdId, label: rosterLabel(hits[0]), fuzzy: false, candidates: [label(hits[0])] };
    return { status: "ambiguous", candidates: hits.map(label) };
  }
  const close = players
    .map((r) => ({ r, s: nameSimilarity(row.name, r.name) }))
    .filter((x) => x.s >= 0.8)
    .sort((a, b) => b.s - a.s);
  const strong = close.filter((x) => sameSchool(x.r) && samePos(x.r));
  if (strong.length === 1 && school) {
    return { status: "matched", cfbdId: strong[0].r.cfbdId, label: rosterLabel(strong[0].r), fuzzy: true, candidates: [label(strong[0].r)] };
  }
  const candidates = close.slice(0, 5).map((x) => label(x.r));
  return candidates.length ? { status: "ambiguous", candidates } : { status: "none", candidates: [] };
}
