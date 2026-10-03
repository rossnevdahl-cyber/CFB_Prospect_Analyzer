"use client";

import { useMemo, useState, useTransition } from "react";
import { previewRankingsAction, saveRankingsAction } from "@/app/imports/rankingsActions";
import type { Preview, RankingSet } from "@/lib/rankings";
import { fmtDate } from "@/lib/format";

const KNOWN_SOURCES = ["Draft Sharks", "NFL Mock Draft Database"];

type Choice = { include: boolean; cfbdId: string | null };

/** Fantasy rookie rankings: paste from a web page (or load a CSV), check the preview, then save. */
export function RankingsImport({ defaultClassYear, existing }: { defaultClassYear: number; existing: RankingSet[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [asOf, setAsOf] = useState(today);
  const [format, setFormat] = useState<"superflex" | "1qb">("superflex");
  const [classYear, setClassYear] = useState(defaultClassYear);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const counts = useMemo(() => {
    if (!preview) return null;
    let matched = 0, pick = 0, none = 0;
    preview.rows.forEach((r, i) => {
      if (!choices[i]?.include) return;
      if (choices[i].cfbdId) matched++;
      else if (r.match.status === "ambiguous") pick++;
      else none++;
    });
    return { matched, pick, none, nfl: preview.rows.filter((r) => r.nflRank != null).length };
  }, [preview, choices]);

  const runPreview = (input: string) =>
    start(async () => {
      setMessage(null);
      const res = await previewRankingsAction(input);
      if (res.error || !res.preview) {
        setPreview(null);
        setMessage({ ok: false, text: res.error ?? "Nothing found" });
        return;
      }
      setPreview(res.preview);
      setChoices(res.preview.rows.map((r) => ({ include: true, cfbdId: r.match.status === "matched" ? r.match.cfbdId : null })));
      // The MDDB card layout is the giveaway for that source.
      if (!source && res.preview.layout === "cards" && res.preview.rows.some((r) => r.nflRank != null)) setSource("NFL Mock Draft Database");
    });

  const save = () =>
    start(async () => {
      if (!preview) return;
      const rows = preview.rows
        .map((r, i) => ({ r, c: choices[i] }))
        .filter(({ c }) => c?.include)
        .map(({ r, c }) => ({ rank: r.rank, name: r.name, position: r.position, school: r.school, nflRank: r.nflRank, cfbdId: c.cfbdId }));
      const res = await saveRankingsAction({ source, asOf, format, classYear, rows });
      if (res.error) setMessage({ ok: false, text: res.error });
      else {
        setMessage({
          ok: true,
          text: `Saved ${res.saved} players (${res.matched} matched to CFBD)${res.nflRanks ? ` and ${res.nflRanks} NFL board ranks` : ""} for ${source}, ${classYear} ${format === "1qb" ? "1QB" : "Superflex"}.`,
        });
        setPreview(null);
        setText("");
        // Each paste names its own source; keeping the old one invites saving under the wrong name.
        setSource("");
      }
    });

  const prior = existing.find((e) => e.source.toLowerCase() === source.trim().toLowerCase() && e.classYear === classYear && e.format === format);

  const setChoice = (i: number, patch: Partial<Choice>) => setChoices((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  return (
    <div className="card space-y-3 p-5 lg:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="card-title mb-0">Fantasy rookie rankings</h2>
        <div className="flex gap-1">
          {(["paste", "file"] as const).map((t) => (
            <button key={t} type="button" className={`btn ${tab === t ? "border-accent text-accent" : ""}`} onClick={() => setTab(t)}>
              {t === "paste" ? "Paste" : "File"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">
        Select the rankings on the source&apos;s page, copy, and paste them here. Lines like “Jeremiah Smith, WR, Ohio State” (order is the rank),
        NFL Mock Draft Database cards (their “BB #” NFL board rank is kept too), and CSV/TSV tables with a Player column all work.
        Only each source&apos;s top 50 are kept. Each save is a dated snapshot; consensus uses each source&apos;s latest one.
      </p>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="label">Source</span>
          <input className="input mt-1" list="ranking-sources" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Draft Sharks" />
          <datalist id="ranking-sources">
            {KNOWN_SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="label">Draft class</span>
          <input className="input mt-1" type="number" value={classYear} onChange={(e) => setClassYear(Number(e.target.value))} />
        </label>
        <label className="block">
          <span className="label">Format</span>
          <select className="input mt-1" value={format} onChange={(e) => setFormat(e.target.value as "superflex" | "1qb")}>
            <option value="superflex">Superflex</option>
            <option value="1qb">1QB</option>
          </select>
        </label>
        <label className="block">
          <span className="label">As of</span>
          <input className="input mt-1" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
      </div>

      {tab === "paste" ? (
        <div className="space-y-2">
          <textarea className="input min-h-40 font-mono text-xs" placeholder="Paste the rankings here…" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="btn-primary" disabled={pending || !text.trim()} onClick={() => runPreview(text)}>
            {pending && !preview ? "Reading…" : "Preview"}
          </button>
        </div>
      ) : (
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          className="block w-full text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) runPreview(await f.text());
          }}
        />
      )}

      {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}

      {preview && counts && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Read <strong>{preview.total}</strong> players ({preview.layout})
              {preview.total > preview.rows.length && <> · keeping the top <strong>{preview.rows.length}</strong></>} · <span className="text-emerald-700">{counts.matched} matched</span>
              {counts.pick > 0 && <span className="text-amber-700"> · {counts.pick} to pick</span>}
              {counts.none > 0 && <span className="text-muted"> · {counts.none} unmatched (saved by name, matched later)</span>}
              {counts.nfl > 0 && <span className="text-muted"> · {counts.nfl} with NFL board rank</span>}
            </span>
            <button type="button" className="btn-primary ml-auto" disabled={pending || !source.trim()} onClick={save}>
              {pending ? "Saving…" : `Save ${preview.rows.filter((_, i) => choices[i]?.include).length} players`}
            </button>
          </div>
          {!source.trim() && <p className="text-xs text-amber-700">Name the source before saving.</p>}
          {prior && (
            <p className="text-xs text-amber-700">
              {prior.asOf === asOf
                ? `Replaces the ${prior.source} snapshot already saved for ${fmtDate(asOf)} (${prior.players} players).`
                : `Adds a new ${prior.source} snapshot; consensus will use it instead of the one from ${fmtDate(prior.asOf)}.`}
            </p>
          )}
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-border">
            <table className="data-table">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  <th />
                  <th className="text-right">Rank</th>
                  <th className="text-left">As pasted</th>
                  <th className="text-right">NFL BB</th>
                  <th className="text-left">Matched player</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => {
                  const c = choices[i];
                  return (
                    <tr key={i} className={c?.include ? "" : "opacity-40"}>
                      <td>
                        <input type="checkbox" checked={c?.include ?? false} onChange={(e) => setChoice(i, { include: e.target.checked })} aria-label={`Include ${r.name}`} />
                      </td>
                      <td className="text-right">{r.rank}</td>
                      <td>
                        {r.name}
                        <span className="text-muted">
                          {" "}
                          {[r.position, r.school].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td className="text-right">{r.nflRank ?? "—"}</td>
                      <td className="whitespace-normal">
                        {r.match.status === "matched" && (
                          <span className="text-emerald-700">
                            ✓ {r.match.label}
                            {r.match.fuzzy && <span className="text-amber-700"> (close spelling)</span>}
                          </span>
                        )}
                        {r.match.status !== "matched" && r.match.candidates.length > 0 && (
                          <select className="input py-0.5 text-xs" value={c?.cfbdId ?? ""} onChange={(e) => setChoice(i, { cfbdId: e.target.value || null })}>
                            <option value="">{r.match.status === "ambiguous" ? "Pick the player…" : "No match"}</option>
                            {r.match.candidates.map((cand) => (
                              <option key={cand.cfbdId} value={cand.cfbdId}>
                                {cand.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {r.match.status === "none" && <span className="text-muted">No CFBD match — kept by name</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {preview.skipped.length > 0 && (
            <details className="text-xs text-muted">
              <summary>Skipped {preview.skipped.length} lines (headers, ads, labels)</summary>
              <div className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{preview.skipped.join("\n")}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
