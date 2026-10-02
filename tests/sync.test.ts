import type { RosterPlayer } from "cfbd";
import { describe, expect, it } from "vitest";
import { rosterRowsForSeason } from "@/lib/sync";

const player = (id: string, team: string, firstName: string | null = "Jordan"): RosterPlayer => ({
  id, firstName: firstName as string, lastName: "Deck", team, height: 74, weight: 190, jersey: 1, year: 2, position: "WR",
  homeCity: null, homeState: null, homeCountry: null, homeLatitude: null, homeLongitude: null, homeCountyFIPS: null, recruitIds: null,
});

describe("rosterRowsForSeason", () => {
  it("keeps one row per player per season (last entry wins) and skips incomplete rows", () => {
    const rows = rosterRowsForSeason([player("1", "Michigan"), player("2", "Buffalo"), player("1", "Toledo"), player("", "X"), player("3", "Y", null)], 2026);
    expect(rows.map((r) => [r.cfbdId, r.team])).toEqual([["1", "Toledo"], ["2", "Buffalo"]]);
    expect(rows[0]).toMatchObject({ season: 2026, fullName: "Jordan Deck", nameNorm: "jordan deck" });
  });
});
