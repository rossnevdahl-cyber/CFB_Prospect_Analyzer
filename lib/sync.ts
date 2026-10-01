import type { RosterPlayer, Team } from "cfbd";
import { sql } from "drizzle-orm";
import type { CfbdAdapter } from "./adapters/cfbd";
import { getDb } from "./db";
import { rosterPlayers, teams } from "./db/schema";
import { normalizeName } from "./names";

/** Seasons of roster history kept for season-to-team mapping (covers a 6th-year transfer). */
export const ROSTER_YEARS = 6;

export function rosterRow(r: RosterPlayer, season: number) {
  const fullName = `${r.firstName} ${r.lastName}`.trim();
  return {
    cfbdId: String(r.id),
    season,
    firstName: r.firstName,
    lastName: r.lastName,
    fullName,
    nameNorm: normalizeName(fullName),
    team: r.team,
    position: r.position,
    height: r.height,
    weight: r.weight,
    jersey: r.jersey,
    classYear: r.year,
    homeCity: r.homeCity,
    homeState: r.homeState,
    homeCountry: r.homeCountry,
    recruitIds: r.recruitIds,
  };
}

export async function upsertRoster(rows: RosterPlayer[], season: number): Promise<number> {
  const db = getDb();
  const values = rows.filter((r) => r.id && r.firstName != null).map((r) => rosterRow(r, season));
  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(rosterPlayers)
      .values(values.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [rosterPlayers.cfbdId, rosterPlayers.season],
        set: {
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          fullName: sql`excluded.full_name`,
          nameNorm: sql`excluded.name_norm`,
          team: sql`excluded.team`,
          position: sql`excluded.position`,
          height: sql`excluded.height`,
          weight: sql`excluded.weight`,
          jersey: sql`excluded.jersey`,
          classYear: sql`excluded.class_year`,
          homeCity: sql`excluded.home_city`,
          homeState: sql`excluded.home_state`,
          homeCountry: sql`excluded.home_country`,
          recruitIds: sql`excluded.recruit_ids`,
        },
      });
  }
  return values.length;
}

export async function upsertTeams(list: Team[]): Promise<number> {
  const db = getDb();
  for (const t of list) {
    const v = {
      id: t.id,
      school: t.school,
      conference: t.conference,
      abbreviation: t.abbreviation,
      color: t.color,
      altColor: t.alternateColor,
      logo: t.logos?.[0] ?? null,
      updatedAt: new Date(),
    };
    await db.insert(teams).values(v).onConflictDoUpdate({ target: teams.id, set: v });
  }
  return list.length;
}

/** Pulls one team's rosters for recent seasons — used on demand when a search misses. */
export async function syncTeamRoster(cfbd: CfbdAdapter, team: string, years = ROSTER_YEARS): Promise<number> {
  let n = 0;
  for (let y = cfbd.season; y > cfbd.season - years; y--) {
    const rows = await cfbd.roster(y, team).catch(() => []);
    n += await upsertRoster(rows, y);
  }
  return n;
}
