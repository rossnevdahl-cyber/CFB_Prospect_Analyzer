import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { ImportForm } from "@/components/ImportForm";
import { RankingsImport } from "@/components/RankingsImport";
import { listRankingSets, type RankingSet } from "@/lib/rankings";
import { getDb, hasDatabase } from "@/lib/db";
import { importLog } from "@/lib/db/schema";
import { fmtDate, fmtLeagueFormat } from "@/lib/format";
import { currentSeason } from "@/lib/metrics";

export default async function ImportsPage() {
  await connection();
  const sets: RankingSet[] = hasDatabase() ? await listRankingSets().catch(() => []) : [];
  const log = hasDatabase() ? await getDb().select().from(importLog).orderBy(desc(importLog.importedAt)).limit(25).catch(() => []) : [];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Imports</h1>
        <p className="text-sm text-muted">
          Paste or upload rankings and exports. Rows are matched to players by name, school and position; reports and boards pick them up right away.
          Nothing here is scraped — export or copy the data yourself in line with each site&apos;s terms.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RankingsImport defaultClassYear={currentSeason() + 1} existing={sets} />
        <ImportForm
          kind="pff"
          title="PFF College (premium)"
          help="Any PFF College table export (passing, rushing, receiving, blocking). Recognized columns include grades_pass, btt_rate, twp_rate, pressure_to_sack_rate, yprr, routes, avg_depth_of_target, yco_attempt, avoided_tackles, elusive_rating, slot_rate, contested_catch_rate, drop_rate, targets, inline/slot/wide snaps, grades_run_block."
          defaultSeason={currentSeason()}
        />
        <ImportForm kind="adp" title="Dynasty rookie ADP" help="Columns: player, adp, and optionally position, school. Pick the format (superflex or 1QB)." />
      </div>
      <div className="card p-5">
        <h2 className="card-title">Fantasy rookie rankings on file (latest per source)</h2>
        {sets.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th className="text-left">Class</th>
                <th className="text-left">Format</th>
                <th className="text-left">Source</th>
                <th className="text-left">As of</th>
                <th className="text-right">Players</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => (
                <tr key={`${s.classYear}${s.format}${s.source}`}>
                  <td>{s.classYear}</td>
                  <td>{fmtLeagueFormat(s.format)}</td>
                  <td>{s.source}</td>
                  <td>{fmtDate(s.asOf)}</td>
                  <td className="text-right">{s.players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">None yet.</p>
        )}
      </div>
      <div className="card p-5">
        <h2 className="card-title">Recent imports</h2>
        {log.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th className="text-left">When</th>
                <th className="text-left">Type</th>
                <th className="text-left">File</th>
                <th className="text-right">Rows</th>
                <th className="text-right">Matched</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td>{fmtDate(l.importedAt.toISOString(), true)}</td>
                  <td>{l.kind}</td>
                  <td>{l.fileName}</td>
                  <td className="text-right">{l.rows}</td>
                  <td className="text-right">{l.matched}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">No imports yet.</p>
        )}
      </div>
    </div>
  );
}
