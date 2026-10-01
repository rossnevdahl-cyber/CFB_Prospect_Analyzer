import "server-only";
import { CfbdAdapter } from "./adapters/cfbd";
import { PgCache } from "./cache";
import { loadGradingConfig } from "./config";
import { getDb } from "./db";
import { fixtureFetch } from "./fixtureFetch";
import { reports } from "./db/schema";
import { buildReport } from "./report/build";
import { PgReportRepo } from "./report/repo";
import type { Report } from "./report/types";
import { PgVideoService } from "./videos";

export function cfbdAdapter(refresh = false): CfbdAdapter {
  const fixtures = process.env.CFBD_FIXTURE_FILE;
  return new CfbdAdapter({
    apiKey: process.env.CFBD_API_KEY,
    cache: new PgCache(),
    refresh,
    // Offline development: serve recorded responses instead of the live API.
    ...(fixtures && process.env.NODE_ENV !== "production"
      ? { fetch: fixtureFetch(fixtures), season: Number(process.env.CFBD_FIXTURE_SEASON) || undefined }
      : {}),
  });
}

/** Builds a report from cached sources (or fresh ones on refresh) and stores it for the boards. */
export async function generateReport(cfbdId: string, opts: { refresh?: boolean } = {}): Promise<Report> {
  const report = await buildReport(cfbdId, {
    cfbd: cfbdAdapter(opts.refresh),
    repo: new PgReportRepo(),
    videos: new PgVideoService(),
    config: loadGradingConfig(),
    refresh: opts.refresh,
  });
  const p = report.player;
  const { notes: _n, ...stored } = report;
  void _n;
  const row = { name: p.name, team: p.team, position: p.position, grade: report.grade.score, tier: report.grade.tier, data: stored, generatedAt: new Date(report.generatedAt) };
  await getDb()
    .insert(reports)
    .values({ cfbdId, ...row })
    .onConflictDoUpdate({ target: reports.cfbdId, set: row });
  return report;
}
