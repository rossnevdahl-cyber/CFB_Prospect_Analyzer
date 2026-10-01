"use client";

import { useActionState } from "react";
import { uploadCsv } from "@/app/imports/actions";

export function ImportForm({ kind, title, help, defaultSeason }: { kind: "pff" | "bigboard" | "adp"; title: string; help: string; defaultSeason?: number }) {
  const [state, action, pending] = useActionState(uploadCsv, undefined);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="card space-y-3 p-5">
      <h2 className="card-title">{title}</h2>
      <p className="text-xs text-muted">{help}</p>
      <input type="hidden" name="kind" value={kind} />
      <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm" />
      {kind === "pff" ? (
        <label className="block">
          <span className="label">Season</span>
          <input name="season" type="number" defaultValue={defaultSeason} className="input mt-1" />
        </label>
      ) : (
        <>
          <label className="block">
            <span className="label">Source</span>
            <input name="source" className="input mt-1" placeholder={kind === "adp" ? "FantasyPros" : "Consensus Big Board"} required />
          </label>
          <label className="block">
            <span className="label">As of</span>
            <input name="asOf" type="date" defaultValue={today} className="input mt-1" />
          </label>
          {kind === "adp" && (
            <label className="block">
              <span className="label">Format</span>
              <select name="format" className="input mt-1" defaultValue="superflex">
                <option value="superflex">Superflex</option>
                <option value="1qb">1QB</option>
              </select>
            </label>
          )}
        </>
      )}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Importing…" : "Upload"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.result && (
        <div className="text-sm">
          <p>
            Imported {state.result.rows} rows · matched {state.result.matched} to CFBD players.
          </p>
          {state.result.unmatched.length > 0 && (
            <details className="mt-1 text-xs text-muted">
              <summary>Unmatched ({state.result.rows - state.result.matched}) — still stored, matched by name + school at report time</summary>
              {state.result.unmatched.join(", ")}
            </details>
          )}
          {state.result.issues.length > 0 && (
            <details className="mt-1 text-xs text-amber-700">
              <summary>Skipped lines ({state.result.issues.length})</summary>
              {state.result.issues.slice(0, 30).map((i) => (
                <div key={i.line}>
                  Line {i.line}: {i.message}
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </form>
  );
}
