/** Name normalization and fuzzy matching used to resolve searches and CSV imports to CFBD ids. */

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

const NICKNAMES: Record<string, string[]> = {
  cam: ["cameron"], cameron: ["cam"],
  chris: ["christopher"], christopher: ["chris"],
  mike: ["michael"], michael: ["mike"],
  matt: ["matthew"], matthew: ["matt"],
  nick: ["nicholas"], nicholas: ["nick"],
  will: ["william"], william: ["will", "bill"], bill: ["william"],
  josh: ["joshua"], joshua: ["josh"],
  jon: ["jonathan", "john"], jonathan: ["jon"], john: ["jon", "johnny"], johnny: ["john"],
  tony: ["anthony"], anthony: ["tony"],
  tj: ["t j"], cj: ["c j"], dj: ["d j"], aj: ["a j"], jj: ["j j"], kj: ["k j"],
  jake: ["jacob"], jacob: ["jake"],
  dan: ["daniel"], daniel: ["dan", "danny"], danny: ["daniel"],
  ben: ["benjamin"], benjamin: ["ben"],
  zach: ["zachary", "zack"], zachary: ["zach"], zack: ["zach"],
  alex: ["alexander"], alexander: ["alex"],
  rob: ["robert"], robert: ["rob", "bobby"], bobby: ["robert"],
  tom: ["thomas"], thomas: ["tom", "tommy"], tommy: ["thomas"],
  jim: ["james"], james: ["jim", "jimmy"], jimmy: ["james"],
  ed: ["edward"], edward: ["ed", "eddie"], eddie: ["edward"],
  sam: ["samuel"], samuel: ["sam"],
  ty: ["tyler"], tyler: ["ty"],
  nate: ["nathan", "nathaniel"], nathan: ["nate"], nathaniel: ["nate"],
};

export function normalizeName(name: string): string {
  const tokens = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t && !SUFFIXES.has(t));
  return tokens.join(" ");
}

/**
 * Alternate school names used by ranking sites, mapped to the normalized CFBD name.
 * Keys and values are already normalized (lower case, punctuation stripped).
 */
const SCHOOL_ALIASES: Record<string, string> = {
  mississippi: "ole miss",
  "miami fl": "miami",
  "miami florida": "miami",
  "miami fla": "miami",
  "miami ohio": "miami oh",
  "southern california": "usc",
  "southern cal": "usc",
  "louisiana state": "lsu",
  "brigham young": "byu",
  "central florida": "ucf",
  "texas christian": "tcu",
  "southern methodist": "smu",
  "north carolina state": "nc state",
  "n c state": "nc state",
  pittsburgh: "pitt",
  connecticut: "uconn",
  massachusetts: "umass",
  "appalachian state": "app state",
  "louisiana lafayette": "louisiana",
  "ul lafayette": "louisiana",
  "louisiana monroe": "ul monroe",
  "texas san antonio": "utsa",
  "texas el paso": "utep",
  "nevada las vegas": "unlv",
  "alabama birmingham": "uab",
  "florida international": "fiu",
  "southern mississippi": "southern miss",
  "middle tennessee state": "middle tennessee",
  hawaii: "hawai i",
};

export function normalizeSchool(s: string | null | undefined): string {
  if (!s) return "";
  const n = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2018\u2019'`]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\bst\.?(?=\s|$)/g, "state")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\buniversity( of)?\b/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return SCHOOL_ALIASES[n] ?? n;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function firstNamesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (NICKNAMES[a]?.includes(b) || NICKNAMES[b]?.includes(a)) return true;
  return a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a));
}

/** 0–1 similarity between two person names, tolerant of nicknames, suffixes and typos. */
export function nameSimilarity(query: string, candidate: string): number {
  const q = normalizeName(query), c = normalizeName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  const qt = q.split(" "), ct = c.split(" ");
  const qLast = qt[qt.length - 1], cLast = ct[ct.length - 1];
  // Last name only.
  if (qt.length === 1) return qLast === cLast ? 0.7 : 0;
  const lastScore = qLast === cLast ? 1 : 1 - levenshtein(qLast, cLast) / Math.max(qLast.length, cLast.length);
  const firstScore = firstNamesMatch(qt[0], ct[0])
    ? 0.95
    : 1 - levenshtein(qt[0], ct[0]) / Math.max(qt[0].length, ct[0].length);
  const overall = 1 - levenshtein(q, c) / Math.max(q.length, c.length);
  return Math.max(overall, 0.6 * lastScore + 0.4 * firstScore) * (lastScore < 0.6 ? 0.5 : 1);
}

/** Autocomplete test: every typed token is the start of some token in the candidate's name. */
export function prefixMatch(query: string, candidate: string): boolean {
  const q = normalizeName(query).split(" ").filter(Boolean);
  const c = normalizeName(candidate).split(" ");
  return q.length > 0 && q.every((t) => c.some((x) => x.startsWith(t)));
}

export type RosterCandidate = {
  cfbdId: string;
  name: string;
  team: string;
  position: string | null;
  classYear: number | null;
  season: number;
};

export type ScoredCandidate = RosterCandidate & { score: number; nameScore: number };

/**
 * Scores roster entries against a search. Name is required; college and position narrow it.
 * Returns an exact match when exactly one candidate has the same normalized name, school and position.
 */
export function rankCandidates(
  query: { name: string; team?: string | null; position?: string | null },
  roster: RosterCandidate[],
  normalizePos: (p: string | null) => string | null,
): { exact: ScoredCandidate | null; candidates: ScoredCandidate[] } {
  const qn = normalizeName(query.name);
  const qt = normalizeSchool(query.team);
  const qp = query.position ?? null;
  // Keep the newest roster row per player.
  const latest = new Map<string, RosterCandidate>();
  for (const r of roster) {
    const prev = latest.get(r.cfbdId);
    if (!prev || r.season > prev.season) latest.set(r.cfbdId, r);
  }
  const scored: ScoredCandidate[] = [];
  for (const r of latest.values()) {
    const nameScore = nameSimilarity(query.name, r.name);
    if (nameScore < 0.55) continue;
    let score = nameScore;
    if (qt) score += normalizeSchool(r.team) === qt ? 0.3 : -0.15;
    if (qp) score += normalizePos(r.position) === qp ? 0.2 : -0.1;
    scored.push({ ...r, score, nameScore });
  }
  scored.sort((a, b) => b.score - a.score);
  const exactHits = scored.filter(
    (c) =>
      normalizeName(c.name) === qn &&
      (!qt || normalizeSchool(c.team) === qt) &&
      (!qp || normalizePos(c.position) === qp),
  );
  return { exact: exactHits.length === 1 ? exactHits[0] : null, candidates: scored.slice(0, 15) };
}
