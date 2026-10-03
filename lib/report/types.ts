import type { AthleticResult } from "../athletic";
import type { Comp } from "../comps";
import type { FeatureVector, GradeResult } from "../grading";
import type { CareerProfile, DerivedSeason } from "../metrics";
import type { Video } from "../adapters/youtube";
import type { Combine, DataGap, Position, Recruiting, SeasonStats, SourceStamp, TeamSeason } from "../types";

export type RosterRow = {
  cfbdId: string;
  season: number;
  firstName: string;
  lastName: string;
  fullName: string;
  team: string;
  position: string | null;
  height: number | null;
  weight: number | null;
  jersey: number | null;
  classYear: number | null;
  homeCity: string | null;
  homeState: string | null;
  homeCountry: string | null;
  recruitIds: string[] | null;
};

export type Note = { id: number; body: string; createdAt: string; updatedAt: string | null };

export type BoardSpot = { classYear: number; rank: number; positionRank: number; tier: string | null };

export type BigBoardSpot = { source: string; rank: number; projectedRound: number | null; asOf: string };
export type AdpSpot = { source: string; adp: number; format: string; asOf: string };
/** A fantasy rookie ranking from one source's latest snapshot. */
export type FantasySpot = { source: string; rank: number; format: string; classYear: number; asOf: string };
/** The player's place in the consensus of all fantasy-ranking sources for a class and format. */
export type ConsensusSpot = { format: string; classYear: number; rank: number; positionRank: number | null; average: number; rankedBy: number; sources: number };

export type VideoSection = {
  status: "ok" | "not_configured" | "error";
  message?: string;
  items: Video[];
  /** Candidates that were filtered in but not shown — lets a pin promote one. */
  pool: Video[];
  searchUrl: string;
  fetchedAt: string | null;
};

export type ReportSeason = {
  stats: SeasonStats;
  derived: DerivedSeason;
  transfer: boolean;
  pff: Record<string, number> | null;
};

export type Report = {
  version: 1;
  cfbdId: string;
  generatedAt: string;
  /** Oldest fetch time among the cached source pulls that fed this report. */
  dataPulledAt: string | null;
  player: {
    name: string;
    firstName: string;
    lastName: string;
    team: string;
    position: Position;
    rosterPosition: string | null;
    classYear: number | null;
    classLabel: string | null;
    heightIn: number | null;
    weight: number | null;
    jersey: number | null;
    hometown: string | null;
    birthdate: string | null;
    birthdateSource: string | null;
    age: number | null;
    projectedDraftYear: number;
    latestSeason: number;
  };
  board: BoardSpot | null;
  grade: GradeResult;
  features: FeatureVector;
  comps: Comp[];
  seasons: ReportSeason[];
  profile: Omit<CareerProfile, "seasons">;
  athletic: { combine: Combine | null; result: AthleticResult };
  rankings: {
    bigBoard: BigBoardSpot[];
    fantasy: FantasySpot[];
    consensus: ConsensusSpot[];
    adp: AdpSpot[];
    projectedRound: number | null;
    draft: { year: number; round: number | null; pick: number | null } | null;
  };
  teamContext: TeamSeason[];
  recruiting: Recruiting | null;
  videos: VideoSection;
  notes: Note[];
  gaps: DataGap[];
  sources: SourceStamp[];
  timings: { totalMs: number; cfbdCalls: number; cfbdCacheHits: number };
};
