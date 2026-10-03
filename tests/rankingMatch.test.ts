import { describe, expect, it } from "vitest";
import { normalizeName } from "@/lib/names";
import { resolveMatch, type RosterRef } from "@/lib/rankingMatch";

const r = (cfbdId: string, name: string, team: string, position: string, season = 2026): RosterRef => ({ cfbdId, name, nameNorm: normalizeName(name), team, position, classYear: 3, season });
const roster = [
  r("1", "Darian Mensah", "Miami", "QB"),
  r("1", "Darian Mensah", "Duke", "QB", 2025),
  r("2", "Kewan Lacy", "Ole Miss", "RB"),
  r("3", "Isaiah Sategna", "Oklahoma", "WR"),
  r("4", "Mark Fletcher Jr.", "Miami", "RB"),
  r("5", "Chris Johnson", "Utah", "WR"),
  r("6", "Chris Johnson", "Utah", "RB"),
  r("7", "Chris Johnson", "Boise State", "WR"),
];

describe("resolveMatch", () => {
  it("matches across school aliases and transfers (newest roster row)", () => {
    expect(resolveMatch({ name: "Darian Mensah", school: "Miami (FL)", position: "QB" }, roster)).toMatchObject({ status: "matched", cfbdId: "1", fuzzy: false });
    expect(resolveMatch({ name: "Kewan Lacy", school: "Mississippi", position: "RB" }, roster)).toMatchObject({ status: "matched", cfbdId: "2" });
  });
  it("matches through suffixes", () => {
    expect(resolveMatch({ name: "Isaiah Sategna III", school: "Oklahoma", position: "WR" }, roster)).toMatchObject({ status: "matched", cfbdId: "3" });
    expect(resolveMatch({ name: "Mark Fletcher", school: "Miami", position: "RB" }, roster)).toMatchObject({ status: "matched", cfbdId: "4" });
  });
  it("narrows shared names by school then position, else asks", () => {
    expect(resolveMatch({ name: "Chris Johnson", school: "Utah", position: "RB" }, roster)).toMatchObject({ status: "matched", cfbdId: "6" });
    const amb = resolveMatch({ name: "Chris Johnson", school: null, position: "WR" }, roster);
    expect(amb.status).toBe("ambiguous");
    expect(amb.candidates.map((c) => c.cfbdId).sort()).toEqual(["5", "7"]);
  });
  it("accepts a close spelling only at the same school and position", () => {
    expect(resolveMatch({ name: "Darian Mensa", school: "Miami", position: "QB" }, roster)).toMatchObject({ status: "matched", cfbdId: "1", fuzzy: true });
    expect(resolveMatch({ name: "Darian Mensa", school: "Texas", position: "QB" }, roster).status).toBe("ambiguous");
    expect(resolveMatch({ name: "Wayne Knight", school: "UCLA", position: "RB" }, roster).status).toBe("none");
  });
});
