import Link from "next/link";
import { fmtAge, fmtDate, fmtFeature, fmtInt, fmtNum, fmtPct, formatHeight } from "@/lib/format";
import { featureDefs } from "@/lib/grading";
import { advancedColumns, statColumns, teamColumns } from "@/lib/report/tables";
import type { Report } from "@/lib/report/types";
import { COMPONENT_LABELS, DRILL_LABELS } from "@/lib/types";
import { DataTable, Section, TierPill } from "./Section";
import { NotesSection } from "./NotesSection";
import { ReportToolbar } from "./ReportToolbar";
import { VideosSection } from "./VideosSection";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

export function ReportView({ report: r }: { report: Report }) {
  const p = r.player;
  const defs = featureDefs(p.position);
  const hasPff = r.seasons.some((s) => s.pff);
  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-muted">
              {p.position}
              {p.rosterPosition && p.rosterPosition !== p.position ? ` (listed ${p.rosterPosition})` : ""} · {p.team}
              {p.jersey != null ? ` · #${p.jersey}` : ""}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
          </div>
          <ReportToolbar cfbdId={r.cfbdId} name={p.name} position={p.position} school={p.team} projectedDraftYear={p.projectedDraftYear} board={r.board} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <Fact label="Class" value={p.classLabel ?? "—"} />
          <Fact label="Ht / Wt" value={`${formatHeight(p.heightIn)} / ${p.weight ?? "—"}`} />
          <Fact label="Age" value={p.age != null ? fmtAge(p.age) : <span className="text-muted">unknown</span>} />
          <Fact label="Hometown" value={p.hometown ?? "—"} />
          <Fact label="Draft class" value={p.projectedDraftYear} />
          <Fact
            label="My board"
            value={
              r.board ? (
                <Link className="text-accent underline" href={`/boards/${r.board.classYear}`}>
                  #{r.board.rank} · {p.position}
                  {r.board.positionRank}
                  {r.board.tier ? ` · ${r.board.tier}` : ""}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Fact label="Data pulled" value={fmtDate(r.dataPulledAt, true)} />
        </div>
      </section>

      {/* 2. Grade */}
      <Section id="grade" title="Grade summary">
        <div className="flex flex-wrap items-center gap-6">
          <div className="text-5xl font-black tabular-nums">{r.grade.score != null ? fmtNum(r.grade.score, 1) : "—"}</div>
          <div className="space-y-1">
            <TierPill tier={r.grade.tier} />
            <div className="text-sm text-muted">Confidence {fmtPct(r.grade.confidence, 0)} of weight backed by data</div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {r.grade.components.map((c) => (
            <details key={c.component} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 text-sm">
                <span className="w-40 shrink-0">{COMPONENT_LABELS[c.component]}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-background">
                  {c.score != null && <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${c.score}%` }} />}
                </span>
                <span className="w-14 text-right font-semibold tabular-nums">{c.score != null ? fmtNum(c.score, 0) : "—"}</span>
                <span className="w-40 text-right text-xs text-muted">
                  {c.score != null ? `weight ${fmtPct(c.weight, 0)} → ${fmtPct(c.effectiveWeight, 0)}` : c.reason}
                </span>
              </summary>
              <ul className="mt-1 mb-2 ml-40 space-y-0.5 text-xs text-muted">
                {c.features.map((f) => (
                  <li key={f.key}>
                    {f.label}: {fmtFeature(f.value, defs.find((d) => d.key === f.key)?.format ?? "num2")}
                    {f.percentile != null ? ` → ${fmtInt(f.percentile)}th pct` : f.note ? ` (${f.note})` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </Section>

      {/* 3. Comps */}
      <Section id="comps" title="Historical comps">
        <DataTable
          rows={r.comps}
          empty="No historical player clears the similarity threshold (or the history table is empty)."
          cols={[
            { label: "Player", get: (c) => c.name },
            { label: "Similarity", get: (c) => fmtPct(c.similarity, 0), align: "right" },
            { label: "College line", get: (c) => `${c.college}: ${c.collegeLine}` },
            { label: "Draft", get: (c) => (c.draftPick ? `${c.draftYear} R${c.draftRound} #${c.draftPick}` : String(c.draftYear)) },
            { label: "NFL Y1–3 PPG", get: (c) => (c.nflPpg == null ? "—" : `${fmtNum(c.nflPpg, 1)} (${c.nflGames} g)`), align: "right" },
          ]}
        />
      </Section>

      {/* 4. Season stats */}
      <Section id="stats" title="Season-by-season stats">
        <DataTable rows={r.seasons} cols={statColumns(p.position)} empty="No FBS stats recorded yet." />
      </Section>

      {/* 5. Advanced */}
      <Section id="advanced" title="Advanced metrics">
        <DataTable rows={r.seasons} cols={advancedColumns(p.position, hasPff)} />
        {r.seasons.some((s) => s.stats.sacksEstimated) && <p className="mt-2 text-xs text-muted">* Sacks estimated from team sacks allowed.</p>}
      </Section>

      {/* 6. Market share */}
      <Section id="breakout" title="Market share and breakout">
        {p.position === "QB" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Fact label="Career rush share" value={fmtPct(r.profile.careerRushShare)} />
            <Fact label="Peak season" value={r.profile.peakSeason ?? "—"} />
            <Fact label="Age at peak" value={fmtAge(r.profile.ageAtPeak)} />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Fact label="Peak dominator" value={fmtPct(r.profile.peakDominator)} />
              <Fact label="Career dominator" value={fmtPct(r.profile.careerDominator)} />
              <Fact
                label="Breakout age"
                value={
                  r.profile.breakoutSeason
                    ? `${r.profile.breakoutAge != null ? fmtAge(r.profile.breakoutAge) : "age unknown"} (${r.profile.breakoutSeason})`
                    : "No breakout yet"
                }
              />
              <Fact label="Peak season" value={r.profile.peakSeason ? `${r.profile.peakSeason} (age ${fmtAge(r.profile.ageAtPeak)})` : "—"} />
            </div>
            <div className="mt-4 flex items-end gap-2">
              {r.seasons.map((s) => (
                <div key={s.stats.season} className="flex flex-col items-center gap-1 text-xs">
                  <span className="tabular-nums">{fmtPct(s.derived.dominator, 0)}</span>
                  <span className="w-10 rounded-t bg-accent/80" style={{ height: `${Math.max(2, (s.derived.dominator ?? 0) * 200)}px` }} />
                  <span className="text-muted">{s.stats.season}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* 7. Athletic */}
      <Section id="athletic" title="Athletic testing">
        {r.athletic.combine ? (
          <>
            <p className="mb-2 text-sm">
              Athletic score <strong>{r.athletic.result.score != null ? fmtNum(r.athletic.result.score, 1) : "—"}</strong> / 10 · {r.athletic.combine.source}
              {r.athletic.result.reason ? ` · ${r.athletic.result.reason}` : ""}
            </p>
            <DataTable
              rows={r.athletic.result.drills}
              cols={[
                { label: "Drill", get: (d) => DRILL_LABELS[d.drill] },
                { label: "Result", get: (d) => String(d.value), align: "right" },
                { label: "Size-adj. pct", get: (d) => fmtNum(d.percentile, 0), align: "right" },
              ]}
            />
          </>
        ) : (
          <p className="text-sm text-muted">Not yet tested.</p>
        )}
      </Section>

      {/* 8. Rankings */}
      <Section id="rankings" title="Rankings">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="label">NFL big board</div>
            {r.rankings.bigBoard.length ? (
              r.rankings.bigBoard.map((b) => (
                <div key={b.source} className="text-sm">
                  <strong>#{b.rank}</strong> — {b.source}, {fmtDate(b.asOf)}
                </div>
              ))
            ) : (
              <div className="text-sm text-muted">Not imported</div>
            )}
          </div>
          <div>
            <div className="label">Dynasty rookie ADP</div>
            {r.rankings.adp.length ? (
              r.rankings.adp.map((a) => (
                <div key={a.source + a.format} className="text-sm">
                  <strong>{fmtNum(a.adp, 1)}</strong> ({a.format}) — {a.source}, {fmtDate(a.asOf)}
                </div>
              ))
            ) : (
              <div className="text-sm text-muted">Not imported</div>
            )}
          </div>
          <div>
            <div className="label">{r.rankings.draft ? "Drafted" : "Projected round"}</div>
            <div className="text-sm">
              {r.rankings.draft
                ? `${r.rankings.draft.year} · round ${r.rankings.draft.round} · pick ${r.rankings.draft.pick}`
                : r.rankings.projectedRound ?? <span className="text-muted">—</span>}
            </div>
          </div>
        </div>
      </Section>

      {/* 9. Team context */}
      <Section id="team" title="Team context">
        <DataTable rows={r.teamContext} cols={teamColumns} />
      </Section>

      {/* 10. Recruiting */}
      <Section id="recruiting" title="Recruiting">
        {r.recruiting ? (
          <div className="grid gap-4 sm:grid-cols-5">
            <Fact label="Stars" value={r.recruiting.stars ? "★".repeat(r.recruiting.stars) : "—"} />
            <Fact label="Composite" value={fmtNum(r.recruiting.rating, 4)} />
            <Fact label="National rank" value={r.recruiting.nationalRank ?? "—"} />
            <Fact label={`Position rank (${r.recruiting.recruitPosition ?? "—"})`} value={r.recruiting.positionRank ?? "—"} />
            <Fact label="Class" value={`${r.recruiting.year}${r.recruiting.school ? ` · ${r.recruiting.school}` : ""}`} />
          </div>
        ) : (
          <p className="text-sm text-muted">No recruiting record matched.</p>
        )}
      </Section>

      {/* 11. Videos */}
      <VideosSection cfbdId={r.cfbdId} videos={r.videos} />

      {/* 12. Notes */}
      <NotesSection cfbdId={r.cfbdId} playerName={p.name} notes={r.notes} />

      {/* 13. Gaps */}
      <Section id="gaps" title="Data gaps">
        {r.gaps.length ? (
          <ul className="space-y-1 text-sm">
            {r.gaps.map((g, i) => (
              <li key={i}>
                <span className="font-medium">
                  {g.section} — {g.field}:
                </span>{" "}
                <span className="text-muted">{g.reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">None.</p>
        )}
      </Section>

      {/* 14. Sources */}
      <Section id="sources" title="Sources and timestamps">
        <ul className="space-y-1 text-sm">
          {r.sources.map((s, i) => (
            <li key={i}>
              <span className="font-medium">{s.source}</span>: {s.detail}
              {s.fetchedAt ? <span className="text-muted"> ({fmtDate(s.fetchedAt, true)})</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Generated {fmtDate(r.generatedAt, true)} in {r.timings.totalMs} ms · {r.timings.cfbdCalls} CFBD lookups, {r.timings.cfbdCacheHits} from cache.
        </p>
      </Section>
    </div>
  );
}
