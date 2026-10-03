import type { CombineRef } from "@/lib/athletic";
import type { HistoryRow } from "@/lib/grading";
import type { PffSeason, ReportRepo } from "@/lib/report/repo";
import type { AdpSpot, BigBoardSpot, BoardSpot, ConsensusSpot, FantasySpot, Note, RosterRow } from "@/lib/report/types";
import type { Combine, Position } from "@/lib/types";

export class MemoryRepo implements ReportRepo {
  roster: RosterRow[] = [];
  historyRows: HistoryRow[] = [];
  refs: CombineRef[] = [];
  combine: Combine | null = null;
  pffRows: PffSeason[] = [];
  board: BigBoardSpot[] = [];
  adpRows: AdpSpot[] = [];
  fantasyRows: { spots: FantasySpot[]; consensus: ConsensusSpot[] } = { spots: [], consensus: [] };
  birth: { date: string; source: string } | null = null;
  spot: BoardSpot | null = null;
  noteRows: Note[] = [];

  async rosterRows(id: string) {
    return this.roster.filter((r) => r.cfbdId === id).sort((a, b) => a.season - b.season);
  }
  async history(p: Position) {
    return this.historyRows.filter((h) => h.position === p);
  }
  async combineRefs() {
    return this.refs;
  }
  async combineFor() {
    return this.combine;
  }
  async pff() {
    return this.pffRows;
  }
  async bigBoard() {
    return this.board;
  }
  async adp() {
    return this.adpRows;
  }
  async fantasy() {
    return this.fantasyRows;
  }
  async birthdate() {
    return this.birth;
  }
  async boardSpot() {
    return this.spot;
  }
  async notes() {
    return this.noteRows;
  }
}
