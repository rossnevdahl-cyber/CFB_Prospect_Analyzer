/**
 * sync-rosters: refreshes FBS teams and rosters from CFBD.
 *   pnpm sync:rosters              current season only
 *   pnpm sync:rosters --backfill   the last ROSTER_YEARS seasons (first run)
 */
import { closeDb } from "../lib/db";
import { ROSTER_YEARS, upsertRoster, upsertTeams } from "../lib/sync";
import { arg, jobCfbd, log } from "./env";

async function main() {
  const cfbd = jobCfbd({ refresh: true });
  const teams = await cfbd.fbsTeams();
  log(`teams: ${await upsertTeams(teams)}`);
  const years = arg("backfill") ? ROSTER_YEARS : 1;
  for (let y = cfbd.season; y > cfbd.season - years; y--) {
    const rows = await cfbd.roster(y);
    log(`${y}: ${await upsertRoster(rows, y)} roster rows`);
  }
  log(`done — ${cfbd.stats.calls} CFBD calls`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
