/**
 * tune-weights: searches component weights per position on older draft classes and checks them on
 * newer ones. Writes docs/weight-tuning.md; does not edit config/grading.yaml.
 *   pnpm tune:weights [--train-through 2018] [--exclude-recent 2] [--fixed draft_capital]
 */
import fs from "node:fs";
import path from "node:path";
import { loadGradingConfig } from "../lib/config";
import { closeDb } from "../lib/db";
import { PgReportRepo } from "../lib/report/repo";
import { tunePosition, tuningMarkdown } from "../lib/tuning";
import { COMPONENTS, POSITIONS, type Component } from "../lib/types";
import { arg, log } from "./env";

async function main() {
  const repo = new PgReportRepo();
  const history = (await Promise.all(POSITIONS.map((p) => repo.history(p)))).flat();
  if (!history.length) throw new Error("history_players is empty — run update-history first");
  const config = loadGradingConfig();
  const latestDraft = Math.max(...history.map((h) => h.draftYear));
  const testThrough = latestDraft - Number(arg("exclude-recent") ?? 2);
  const trainThrough = Number(arg("train-through") ?? 2018);
  const fixed = (arg("fixed") ?? "draft_capital").split(",").filter((c): c is Component => (COMPONENTS as readonly string[]).includes(c));
  const results = POSITIONS.map((p) => tunePosition(p, history, config, { trainThrough, testThrough, fixed }));
  for (const r of results) log(`${r.position}: test ρ ${r.testRho.spec.toFixed(3)} → ${r.testRho.tuned.toFixed(3)} (${r.adopt ? "adopt" : "keep spec"})`);
  const md = tuningMarkdown(results, { generated: new Date().toISOString().slice(0, 10), trainThrough, testThrough, fixed });
  fs.mkdirSync(path.join(process.cwd(), "docs"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "docs", "weight-tuning.md"), md);
  log("wrote docs/weight-tuning.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
