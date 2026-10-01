/**
 * Records real CFBD responses as test fixtures (needs CFBD_API_KEY; tests never call the live API).
 *   pnpm record:fixtures --file cfbd/wr-transfer.json      re-record every request in an existing fixture file
 *   pnpm record:fixtures --player 4870001 --out cfbd/x.json record everything one report requests (needs DATABASE_URL)
 */
import fs from "node:fs";
import path from "node:path";
import { CfbdAdapter } from "../lib/adapters/cfbd";
import { MemoryCache } from "../lib/cache";
import { loadGradingConfig } from "../lib/config";
import { closeDb } from "../lib/db";
import { fixtureKey } from "../lib/fixtureFetch";
import { buildReport } from "../lib/report/build";
import { PgReportRepo } from "../lib/report/repo";
import { arg, log } from "./env";

const dir = path.join(process.cwd(), "tests", "fixtures");

async function main() {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error("CFBD_API_KEY is not set");
  const recorded: Record<string, unknown> = {};
  const recordingFetch = async (req: Request) => {
    const res = await fetch(req);
    if (res.ok) recorded[fixtureKey(new URL(req.url))] = await res.clone().json();
    return res;
  };

  const file = arg("file");
  const player = arg("player");
  if (file) {
    const existing = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
    for (const k of Object.keys(existing)) {
      await recordingFetch(new Request(`https://api.collegefootballdata.com${k}`, { headers: { Authorization: `Bearer ${key}` } }));
    }
    fs.writeFileSync(path.join(dir, file), JSON.stringify(recorded, null, 1));
    log(`re-recorded ${Object.keys(recorded).length} responses into ${file}`);
  } else if (player) {
    const out = arg("out") ?? `cfbd/player-${player}.json`;
    const cfbd = new CfbdAdapter({ apiKey: key, cache: new MemoryCache(), fetch: recordingFetch });
    await buildReport(player, { cfbd, repo: new PgReportRepo(), config: loadGradingConfig() });
    fs.writeFileSync(path.join(dir, out), JSON.stringify(recorded, null, 1));
    log(`recorded ${Object.keys(recorded).length} responses into ${out}`);
  } else {
    throw new Error("pass --file <fixture> or --player <cfbdId>");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
