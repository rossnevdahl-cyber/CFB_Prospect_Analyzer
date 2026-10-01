import { parseCsv, toNumber } from "./csv";
import { parseHeight } from "../metrics";
import type { NflSeason } from "../fantasy";
import type { Combine } from "../types";

const BASE = "https://github.com/nflverse/nflverse-data/releases/download";

export const NFLVERSE_FILES = {
  draftPicks: `${BASE}/draft_picks/draft_picks.csv`,
  combine: `${BASE}/combine/combine.csv`,
  players: `${BASE}/players/players.csv`,
  seasonStats: `${BASE}/player_stats/player_stats_season.csv`,
} as const;

export type NflDraftPick = {
  season: number;
  round: number;
  pick: number;
  gsisId: string | null;
  pfrId: string | null;
  cfbId: string | null;
  name: string;
  position: string;
  college: string;
};

export type NflCombine = Combine & {
  pfrId: string | null;
  cfbId: string | null;
  name: string;
  position: string;
  school: string | null;
  draftYear: number | null;
};

export type NflPlayer = { gsisId: string; pfrId: string | null; name: string; birthDate: string | null; college: string | null };

export type NflSeasonRow = NflSeason & { playerId: string; position: string };

const str = (v: string | undefined) => (v && v.trim() !== "" && v !== "NA" ? v.trim() : null);

export function parseDraftPicks(text: string): NflDraftPick[] {
  return parseCsv(text).map((r) => ({
    season: Number(r.season),
    round: Number(r.round),
    pick: Number(r.pick),
    gsisId: str(r.gsis_id),
    pfrId: str(r.pfr_player_id),
    cfbId: str(r.cfb_player_id),
    name: r.pfr_player_name,
    position: r.position,
    college: r.college,
  }));
}

export function parseCombine(text: string): NflCombine[] {
  return parseCsv(text).map((r) => ({
    season: toNumber(r.season),
    draftYear: toNumber(r.draft_year),
    pfrId: str(r.pfr_id),
    cfbId: str(r.cfb_id),
    name: r.player_name,
    position: r.pos,
    school: str(r.school),
    heightIn: parseHeight(str(r.ht)),
    weight: toNumber(r.wt),
    forty: toNumber(r.forty),
    bench: toNumber(r.bench),
    vertical: toNumber(r.vertical),
    broad: toNumber(r.broad_jump),
    cone: toNumber(r.cone),
    shuttle: toNumber(r.shuttle),
    source: "nflverse combine",
  }));
}

export function parsePlayers(text: string): NflPlayer[] {
  return parseCsv(text)
    .filter((r) => r.gsis_id)
    .map((r) => ({
      gsisId: r.gsis_id,
      pfrId: str(r.pfr_id),
      name: r.display_name,
      birthDate: str(r.birth_date),
      college: str(r.college_name),
    }));
}

/** Regular-season rows only; postseason games do not count toward fantasy PPG. */
export function parseSeasonStats(text: string): NflSeasonRow[] {
  return parseCsv(text)
    .filter((r) => r.season_type === "REG")
    .map((r) => {
      const n = (k: string) => toNumber(r[k]) ?? 0;
      return {
        playerId: r.player_id,
        position: r.position,
        season: n("season"),
        games: n("games"),
        passingYards: n("passing_yards"),
        passingTds: n("passing_tds"),
        interceptions: n("interceptions"),
        rushingYards: n("rushing_yards"),
        rushingTds: n("rushing_tds"),
        receptions: n("receptions"),
        receivingYards: n("receiving_yards"),
        receivingTds: n("receiving_tds"),
        fumblesLost: n("sack_fumbles_lost") + n("rushing_fumbles_lost") + n("receiving_fumbles_lost"),
        twoPt: n("passing_2pt_conversions") + n("rushing_2pt_conversions") + n("receiving_2pt_conversions"),
      };
    });
}

export async function downloadText(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`nflverse download failed (${res.status}): ${url}`);
  return res.text();
}
