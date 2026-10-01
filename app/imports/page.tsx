import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { ImportForm } from "@/components/ImportForm";
import { getDb, hasDatabase } from "@/lib/db";
import { importLog } from "@/lib/db/schema";
import { fmtDate } from "@/lib/format";
import { currentSeason } from "@/lib/metrics";

export default async function ImportsPage() {
  await connection();
  const log = hasDatabase() ? await getDb().select().from(importLog).orderBy(desc(importLog.importedAt)).limit(25).catch(() => []) : [];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Imports</h1>
        <p className="text-sm text-muted">
          Upload CSV exports. Rows are matched to players by name, school and position; the next report picks them up.
          Nothing here is scraped — export or copy the data yourself in line with each site&apos;s terms.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ImportForm
          kind="pff"
          title="PFF College (premium)"
          help="Any PFF College table export (passing, rushing, receiving, blocking). Recognized columns include grades_pass, btt_rate, twp_rate, pressure_to_sack_rate, yprr, routes, avg_depth_of_target, yco_attempt, avoided_tackles, elusive_rating, slot_rate, contested_catch_rate, drop_rate, targets, inline/slot/wide snaps, grades_run_block."
          defaultSeason={currentSeason()}
        />
        <ImportForm kind="bigboard" title="NFL big board" help="Columns: rank, player, and optionally school, position, projected_round. Re-importing the same source and date replaces it." />
        <ImportForm kind="adp" title="Dynasty rookie ADP" help="Columns: player, adp, and optionally position, school. Pick the format (superflex or 1QB)." />
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
