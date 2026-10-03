import { describe, expect, it } from "vitest";
import { nameSimilarity, normalizeName, normalizeSchool, rankCandidates, type RosterCandidate } from "@/lib/names";
import { normalizePosition } from "@/lib/types";

const roster: RosterCandidate[] = [
  { cfbdId: "1", name: "Jeremiah Smith", team: "Ohio State", position: "WR", classYear: 2, season: 2025 },
  { cfbdId: "1", name: "Jeremiah Smith", team: "Ohio State", position: "WR", classYear: 3, season: 2026 },
  { cfbdId: "3", name: "Jeremiah Smith", team: "Toledo", position: "RB", classYear: 1, season: 2026 },
  { cfbdId: "4", name: "Cameron Ward Jr.", team: "Miami", position: "QB", classYear: 5, season: 2024 },
  { cfbdId: "5", name: "Ryan Williams", team: "Alabama", position: "WR", classYear: 2, season: 2026 },
  { cfbdId: "6", name: "Arch Manning", team: "Texas", position: "QB", classYear: 3, season: 2026 },
];

describe("names", () => {
  it("normalizes accents, punctuation and suffixes", () => {
    expect(normalizeName("Cameron Ward Jr.")).toBe("cameron ward");
    expect(normalizeName("D'Andre O’Neal III")).toBe("dandre oneal");
    expect(normalizeName("José Núñez")).toBe("jose nunez");
    expect(normalizeSchool("Ohio St.")).toBe(normalizeSchool("Ohio State"));
  });
  it("tolerates nicknames and typos", () => {
    expect(nameSimilarity("Cam Ward", "Cameron Ward Jr.")).toBeGreaterThan(0.85);
    expect(nameSimilarity("Jeremiah Smtih", "Jeremiah Smith")).toBeGreaterThan(0.8);
    expect(nameSimilarity("Arch Manning", "Ryan Williams")).toBeLessThan(0.55);
  });
});

describe("rankCandidates", () => {
  it("returns an exact match when name, school and position agree (newest roster row)", () => {
    const r = rankCandidates({ name: "jeremiah smith", team: "Ohio State", position: "WR" }, roster, normalizePosition);
    expect(r.exact?.cfbdId).toBe("1");
    expect(r.exact?.season).toBe(2026);
  });
  it("shows a pick list when the name is shared and school is not given", () => {
    const r = rankCandidates({ name: "Jeremiah Smith" }, roster, normalizePosition);
    expect(r.exact).toBeNull();
    expect(r.candidates.map((c) => c.cfbdId)).toEqual(expect.arrayContaining(["1", "3"]));
  });
  it("offers close matches for nicknames instead of an exact hit", () => {
    const r = rankCandidates({ name: "Cam Ward", position: "QB" }, roster, normalizePosition);
    expect(r.exact).toBeNull();
    expect(r.candidates[0].cfbdId).toBe("4");
  });
  it("position narrows ties", () => {
    const r = rankCandidates({ name: "Jeremiah Smith", position: "RB" }, roster, normalizePosition);
    expect(r.exact?.cfbdId).toBe("3");
  });
});

describe("prefixMatch (autocomplete)", () => {
  it("matches partial tokens in any order", async () => {
    const { prefixMatch } = await import("@/lib/names");
    expect(prefixMatch("test rec", "Test Receiver")).toBe(true);
    expect(prefixMatch("jer", "Jeremiah Smith")).toBe(true);
    expect(prefixMatch("smith jer", "Jeremiah Smith")).toBe(true);
    expect(prefixMatch("jex", "Jeremiah Smith")).toBe(false);
  });
});

describe("school aliases", () => {
  it("maps ranking-site school names onto CFBD names", () => {
    expect(normalizeSchool("Mississippi")).toBe(normalizeSchool("Ole Miss"));
    expect(normalizeSchool("Miami (FL)")).toBe(normalizeSchool("Miami"));
    expect(normalizeSchool("Miami (OH)")).not.toBe(normalizeSchool("Miami"));
    expect(normalizeSchool("Hawaii")).toBe(normalizeSchool("Hawai'i"));
    expect(normalizeSchool("Texas A&M")).toBe(normalizeSchool("Texas A & M"));
    expect(normalizeSchool("Southern California")).toBe(normalizeSchool("USC"));
  });
});
