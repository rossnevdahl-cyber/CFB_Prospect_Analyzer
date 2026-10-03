import { normalizePosition } from "./types";

/** A row of one source's latest snapshot. */
export type SourceRow = {
  cfbdId: string | null;
  name: string;
  nameNorm: string;
  schoolNorm: string;
  school: string | null;
  position: string | null;
  rank: number;
};

export type SourceSnapshot = { source: string; asOf: string; rows: SourceRow[] };

export type ConsensusEntry = {
  key: string;
  cfbdId: string | null;
  name: string;
  position: string | null;
  school: string | null;
  /** Average rank; a source that leaves the player off counts as one past its last rank. */
  average: number;
  rank: number;
  positionRank: number | null;
  /** Rank per source; null when that source does not rank the player. */
  sources: Record<string, number | null>;
  rankedBy: number;
  best: number;
  worst: number;
};

/**
 * Consensus across sources. Players are joined by CFBD id, or by normalized name and school when a
 * row was not matched to a CFBD player. Ties in average go to the player more sources rank, then
 * to the better best rank.
 */
export function buildConsensus(snapshots: SourceSnapshot[]): ConsensusEntry[] {
  type Acc = { key: string; cfbdId: string | null; name: string; nameNorm: string; schoolNorm: string; position: string | null; school: string | null; sources: Record<string, number> };
  const players: Acc[] = [];
  const byKey = new Map<string, Acc>();
  const byName = new Map<string, Acc[]>();

  const find = (r: SourceRow): Acc | undefined => {
    if (r.cfbdId && byKey.has(`id:${r.cfbdId}`)) return byKey.get(`id:${r.cfbdId}`);
    const sameName = byName.get(r.nameNorm) ?? [];
    return sameName.find((p) => (!r.cfbdId || !p.cfbdId || p.cfbdId === r.cfbdId) && (!p.schoolNorm || !r.schoolNorm || p.schoolNorm === r.schoolNorm));
  };

  for (const snap of snapshots) {
    for (const r of snap.rows) {
      let p = find(r);
      if (!p) {
        p = { key: r.cfbdId ? `id:${r.cfbdId}` : `name:${r.nameNorm}|${r.schoolNorm}`, cfbdId: r.cfbdId, name: r.name, nameNorm: r.nameNorm, schoolNorm: r.schoolNorm, position: r.position, school: r.school, sources: {} };
        players.push(p);
        byName.set(r.nameNorm, [...(byName.get(r.nameNorm) ?? []), p]);
      }
      if (r.cfbdId && !p.cfbdId) {
        p.cfbdId = r.cfbdId;
        p.key = `id:${r.cfbdId}`;
      }
      byKey.set(p.key, p);
      p.position ??= r.position;
      p.school ??= r.school;
      if (!p.schoolNorm) p.schoolNorm = r.schoolNorm;
      // Keep the better rank if a source lists a player twice.
      p.sources[snap.source] = Math.min(p.sources[snap.source] ?? Infinity, r.rank);
    }
  }

  const missRank = new Map(snapshots.map((s) => [s.source, Math.max(0, ...s.rows.map((r) => r.rank)) + 1]));
  const entries = players.map((p) => {
    const sources: Record<string, number | null> = {};
    let sum = 0;
    const ranked: number[] = [];
    for (const s of snapshots) {
      const r = p.sources[s.source];
      sources[s.source] = r ?? null;
      if (r != null) ranked.push(r);
      sum += r ?? (missRank.get(s.source) as number);
    }
    return {
      key: p.key,
      cfbdId: p.cfbdId,
      name: p.name,
      position: normalizePosition(p.position) ?? p.position,
      school: p.school,
      average: snapshots.length ? sum / snapshots.length : 0,
      rank: 0,
      positionRank: null as number | null,
      sources,
      rankedBy: ranked.length,
      best: Math.min(...ranked),
      worst: Math.max(...ranked),
    };
  });

  entries.sort((a, b) => a.average - b.average || b.rankedBy - a.rankedBy || a.best - b.best || a.name.localeCompare(b.name));
  const posCount: Record<string, number> = {};
  entries.forEach((e, i) => {
    e.rank = i + 1;
    if (e.position) e.positionRank = posCount[e.position] = (posCount[e.position] ?? 0) + 1;
  });
  return entries;
}

export type BoardComparison = {
  cfbdId: string;
  myRank: number;
  consensusRank: number | null;
  /** Positive: you rank the player higher than consensus ("my guy"). Negative: a fade. */
  gap: number | null;
  sources: Record<string, number | null>;
  rankedBy: number;
};

/**
 * Lines a board up against consensus. In a position view both ranks are positional (WR3 vs WR7);
 * otherwise overall, with consensus re-ranked among players on either list so gaps compare like
 * with like.
 */
export function compareBoard(
  board: { cfbdId: string; position: string }[],
  consensus: ConsensusEntry[],
  position?: string | null,
): BoardComparison[] {
  const pos = position ? normalizePosition(position) : null;
  const mine = pos ? board.filter((e) => normalizePosition(e.position) === pos) : board;
  const byId = new Map(consensus.filter((c) => c.cfbdId).map((c) => [c.cfbdId as string, c]));
  return mine.map((e, i) => {
    const c = byId.get(e.cfbdId);
    const consensusRank = c ? (pos ? c.positionRank : c.rank) : null;
    return {
      cfbdId: e.cfbdId,
      myRank: i + 1,
      consensusRank,
      gap: consensusRank == null ? null : consensusRank - (i + 1),
      sources: c?.sources ?? {},
      rankedBy: c?.rankedBy ?? 0,
    };
  });
}

/** Consensus players inside the top `limit` (overall or positional) that are not on the board. */
export function missingFromBoard(board: { cfbdId: string }[], consensus: ConsensusEntry[], limit: number, position?: string | null): ConsensusEntry[] {
  const pos = position ? normalizePosition(position) : null;
  const on = new Set(board.map((b) => b.cfbdId));
  return consensus
    .filter((c) => (pos ? c.position === pos && (c.positionRank ?? Infinity) <= limit : c.rank <= limit))
    .filter((c) => !c.cfbdId || !on.has(c.cfbdId));
}
