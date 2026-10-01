/**
 * backtest: grades every drafted player in the history table as of their final college season and
 * reports the correlation between grade and NFL years 1–3 PPG. Writes docs/backtest.md.
 *   pnpm backtest [--exclude-recent 2]
 */
import fs from "node:fs";
import path from "node:path";
import { backtestMarkdown, runBacktest } from "../lib/backtest";
import { loadGradingConfig } from "../lib/config";
import { closeDb } from "../lib/db";
import { PgReportRepo } from "../lib/report/repo";
import { POSITIONS } from "../lib/types";
import { arg, log } from "./env";

async function main() {
  const repo = new PgReportRepo();
  const history = (await Promise.all(POSITIONS.map((p) => repo.history(p)))).flat();
  if (!history.length) throw new Error("history_players is empty — run update-history first");
  const config = loadGradingConfig();
  const latestDraft = Math.max(...history.map((h) => h.draftYear));
  const excludeRecent = Number(arg("exclude-recent") ?? 2);
  const rows = runBacktest(history, config, { latestDraft, excludeRecent });
  for (const r of rows) log(`${r.position}: n=${r.n} pearson=${r.pearson?.toFixed(3)} spearman=${r.spearman?.toFixed(3)}`);
  const md = backtestMarkdown(rows, {
    generated: new Date().toISOString().slice(0, 10),
    configNote: "Weights from config/grading.yaml at this commit.",
    excluded: `Draft classes after ${latestDraft - excludeRecent} excluded (incomplete NFL outcomes).`,
  });
  fs.mkdirSync(path.join(process.cwd(), "docs"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "docs", "backtest.md"), md);
  log("wrote docs/backtest.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
