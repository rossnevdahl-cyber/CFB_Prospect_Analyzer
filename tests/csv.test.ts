import { describe, expect, it } from "vitest";
import { parseAdpCsv } from "@/lib/adapters/adpCsv";
import { parsePffCsv } from "@/lib/adapters/pffCsv";
import { parseBigBoardCsv, roundFromRank } from "@/lib/adapters/rankingsCsv";

describe("PFF CSV", () => {
  it("maps PFF export columns to canonical metrics and uses the form season", () => {
    const csv = `﻿player,player_id,position,team_name,player_game_count,grades_offense,yprr,routes,avg_depth_of_target,targets,drop_rate,slot_rate,contested_catch_rate
Test Receiver,12345,WR,OREGON,13,88.1,3.12,410,12.4,110,4.5,35.2,55.0
,,,,,,,,,,,,
No Metrics,1,WR,X,,,,,,,,,`;
    const { rows, issues } = parsePffCsv(csv, 2025);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ playerName: "Test Receiver", team: "OREGON", position: "WR", season: 2025 });
    expect(rows[0].metrics).toMatchObject({ yprr: 3.12, routes: 410, adot: 12.4, targets: 110, drop_rate: 4.5, slot_rate: 35.2, offense_grade: 88.1 });
    expect(issues.some((i) => /No Metrics/.test(i.message))).toBe(true);
  });
  it("reads QB and RB columns", () => {
    const csv = `player,team_name,position,grades_pass,btt_rate,twp_rate,pressure_to_sack_rate,yco_attempt,avoided_tackles,elusive_rating,season
QB One,LSU,QB,90.2,6.1,2.0,15.5,,,,2024
RB One,UGA,HB,,,,,3.9,55,120.3,2024`;
    const { rows } = parsePffCsv(csv, 2025);
    expect(rows[0].metrics).toEqual({ pass_grade: 90.2, btt_rate: 6.1, twp_rate: 2, pressure_to_sack_rate: 15.5 });
    expect(rows[0].season).toBe(2024);
    expect(rows[1].metrics).toEqual({ yco_att: 3.9, mtf: 55, elusive_rating: 120.3 });
  });
});

describe("big board CSV", () => {
  it("parses flexible headers and projects rounds", () => {
    const { rows, issues } = parseBigBoardCsv(`RK,Player,Pos,School,Proj. Round
1,Arch Manning,QB,Texas,1
40,Some Guy,WR,Utah,
,Missing Rank,WR,X,`);
    expect(rows).toEqual([
      { playerName: "Arch Manning", position: "QB", school: "Texas", rank: 1, projectedRound: 1 },
      { playerName: "Some Guy", position: "WR", school: "Utah", rank: 40, projectedRound: null },
    ]);
    expect(issues).toHaveLength(1);
    expect(roundFromRank(40)).toBe(2);
    expect(roundFromRank(300)).toBe(7);
  });
});

describe("ADP CSV", () => {
  it("strips positional rank suffixes and reads ADP", () => {
    const { rows } = parseAdpCsv(`Player,Pos,Team,ADP
Ryan Williams,WR1,Alabama,1.4
Jeremiah Smith,WR2,Ohio State,1.1`);
    expect(rows[0]).toEqual({ playerName: "Ryan Williams", position: "WR", school: "Alabama", adp: 1.4 });
    expect(rows[1].adp).toBe(1.1);
  });
});
