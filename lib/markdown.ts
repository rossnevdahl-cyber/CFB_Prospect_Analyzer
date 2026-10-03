import { DRILL_LABELS, COMPONENT_LABELS } from "./types";
import { featureDefs } from "./grading";
import { fmtAge, fmtDate, fmtDuration, fmtFeature, fmtInt, fmtLeagueFormat, fmtNum, fmtPct, formatHeight } from "./format";
import { advancedColumns, statColumns, teamColumns, type Column } from "./report/tables";
import type { Report } from "./report/types";

function table<T>(cols: Column<T>[], rows: T[]): string {
  if (!rows.length) return "_No data._";
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const head = `| ${cols.map((c) => esc(c.label)).join(" | ")} |`;
  const sep = `| ${cols.map((c) => (c.align === "right" ? "---:" : ":---")).join(" | ")} |`;
  const body = rows.map((r) => `| ${cols.map((c) => esc(c.get(r))).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

/** The report as Markdown — same data and section order as the web page. */
export function reportToMarkdown(r: Report, opts: { baseUrl?: string } = {}): string {
  const p = r.player;
  const out: string[] = [];
  const h2 = (s: string) => out.push(`\n## ${s}\n`);

  // 1. Header
  out.push(`# ${p.name} — ${p.position}, ${p.team}`);
  const facts = [
    p.classLabel && `Class: ${p.classLabel}`,
    `Ht/Wt: ${formatHeight(p.heightIn)} / ${p.weight ?? "—"} lb`,
    p.age != null && `Age: ${fmtAge(p.age)}`,
    p.hometown && `Hometown: ${p.hometown}`,
    `Projected draft class: ${p.projectedDraftYear}`,
    r.board && `My board: #${r.board.rank} overall, ${r.player.position}${r.board.positionRank} (${r.board.classYear} class)${r.board.tier ? `, ${r.board.tier}` : ""}`,
  ].filter(Boolean);
  out.push("", facts.join(" · "));
  if (opts.baseUrl) out.push("", `Report: ${opts.baseUrl}/player/${r.cfbdId}`);

  // 2. Grade summary
  h2("Grade summary");
  const g = r.grade;
  out.push(
    g.score == null
      ? `**Grade unavailable** · confidence ${fmtPct(g.confidence, 0)}`
      : `**${fmtNum(g.score, 1)} / 100 — ${g.tier}** · confidence ${fmtPct(g.confidence, 0)}`,
    "",
  );
  for (const c of g.components) {
    const label = COMPONENT_LABELS[c.component];
    out.push(
      c.score == null
        ? `- ${label} (weight ${fmtPct(c.weight, 0)}): — ${c.reason ?? ""}`
        : `- ${label} (weight ${fmtPct(c.weight, 0)} → ${fmtPct(c.effectiveWeight, 0)}): **${fmtNum(c.score, 0)}**`,
    );
  }

  // 3. Comps
  h2("Historical comps");
  if (!r.comps.length) out.push("_No comps above the similarity threshold._");
  else
    out.push(
      table(
        [
          { label: "Player", get: (c) => c.name },
          { label: "Similarity", get: (c) => fmtPct(c.similarity, 0), align: "right" },
          { label: "College", get: (c) => `${c.college}: ${c.collegeLine}` },
          { label: "Draft", get: (c) => (c.draftPick ? `${c.draftYear} R${c.draftRound} #${c.draftPick}` : `${c.draftYear}`) },
          { label: "NFL Y1–3 PPG", get: (c) => (c.nflPpg == null ? "—" : `${fmtNum(c.nflPpg, 1)} (${c.nflGames} g)`), align: "right" },
        ],
        r.comps,
      ),
    );

  // 4. Season stats
  h2("Season-by-season stats");
  out.push(table(statColumns(p.position), r.seasons));

  // 5. Advanced
  h2("Advanced metrics");
  const hasPff = r.seasons.some((s) => s.pff);
  out.push(table(advancedColumns(p.position, hasPff), r.seasons));
  if (r.seasons.some((s) => s.stats.sacksEstimated)) out.push("", "\\* Sacks estimated from team sacks allowed.");

  // 6. Market share and breakout
  h2("Market share and breakout");
  if (p.position === "QB") {
    out.push(`- Career rushing share of team yards: ${fmtPct(r.profile.careerRushShare)}`, `- Peak season: ${r.profile.peakSeason ?? "—"} (age ${fmtAge(r.profile.ageAtPeak)})`);
  } else {
    out.push(
      `- Dominator by season: ${r.seasons.map((s) => `${s.stats.season} ${fmtPct(s.derived.dominator)}`).join(", ") || "—"}`,
      `- Peak dominator: ${fmtPct(r.profile.peakDominator)} · Career: ${fmtPct(r.profile.careerDominator)}`,
      `- Breakout age: ${r.profile.breakoutAge != null ? `${fmtAge(r.profile.breakoutAge)} (${r.profile.breakoutSeason})` : r.profile.breakoutSeason ? `${r.profile.breakoutSeason} (age unknown)` : "no breakout yet"}`,
      `- Peak season: ${r.profile.peakSeason ?? "—"} (age ${fmtAge(r.profile.ageAtPeak)})`,
    );
  }

  // 7. Athletic testing
  h2("Athletic testing");
  const cb = r.athletic.combine;
  if (!cb) out.push("Not yet tested.");
  else {
    out.push(`Source: ${cb.source} · Athletic score: **${r.athletic.result.score != null ? fmtNum(r.athletic.result.score, 1) : "—"} / 10**`, "");
    out.push(
      table(
        [
          { label: "Drill", get: (d) => DRILL_LABELS[d.drill] },
          { label: "Result", get: (d) => String(d.value), align: "right" },
          { label: "Size-adj. percentile", get: (d) => fmtNum(d.percentile, 0), align: "right" },
        ],
        r.athletic.result.drills,
      ),
    );
  }

  // 8. Rankings
  h2("Rankings");
  const rk: string[] = [];
  for (const c of r.rankings.consensus ?? [])
    rk.push(`- Fantasy rookie consensus (${c.classYear} ${fmtLeagueFormat(c.format)}): #${c.rank}${c.positionRank != null ? `, ${p.position}${c.positionRank}` : ""} — average ${fmtNum(c.average, 1)}, ranked by ${c.rankedBy} of ${c.sources} sources`);
  for (const f of r.rankings.fantasy ?? []) rk.push(`- ${f.source} (${f.classYear} ${fmtLeagueFormat(f.format)}): #${f.rank}, ${fmtDate(f.asOf)}`);
  for (const b of r.rankings.bigBoard) rk.push(`- NFL consensus board: #${b.rank}${b.projectedRound ? `, projected round ${b.projectedRound}` : ""} — ${b.source}, ${fmtDate(b.asOf)}`);
  for (const a of r.rankings.adp) rk.push(`- Dynasty rookie ADP (${a.format}): ${fmtNum(a.adp, 1)} — ${a.source}, ${fmtDate(a.asOf)}`);
  if (r.rankings.projectedRound) rk.push(`- Projected round: ${r.rankings.projectedRound}`);
  if (r.rankings.draft) rk.push(`- Drafted: ${r.rankings.draft.year}, round ${r.rankings.draft.round}, pick ${r.rankings.draft.pick}`);
  out.push(rk.length ? rk.join("\n") : "_No rankings imported._");

  // 9. Team context
  h2("Team context");
  out.push(table(teamColumns, r.teamContext));

  // 10. Recruiting
  h2("Recruiting");
  const rc = r.recruiting;
  out.push(
    rc
      ? `${rc.stars ?? "—"}★ · composite ${fmtNum(rc.rating, 4)} · national #${rc.nationalRank ?? "—"} · ${rc.recruitPosition ?? ""} #${rc.positionRank ?? "—"} · class of ${rc.year}${rc.school ? ` · ${rc.school}` : ""}`
      : "_No recruiting record._",
  );

  // 11. Film and highlights
  h2("Film and highlights");
  if (!r.videos.items.length) out.push(`No matching videos found. [Search YouTube](${r.videos.searchUrl})`);
  else
    for (const v of r.videos.items)
      out.push(`- [${v.title}](https://www.youtube.com/watch?v=${v.id}) — ${v.kind === "film" ? "Film review" : "Highlights"}, ${v.channel}, ${fmtDate(v.publishedAt)}, ${fmtDuration(v.durationSec)}`);

  // 12. Notes
  h2("My notes");
  if (!r.notes.length) out.push("_No notes yet._");
  for (const n of r.notes) {
    out.push(`**${fmtDate(n.createdAt, true)}${n.updatedAt ? ` (edited ${fmtDate(n.updatedAt, true)})` : ""}**`, "", n.body, "");
  }

  // 13. Data gaps
  h2("Data gaps");
  out.push(r.gaps.length ? r.gaps.map((x) => `- **${x.section} — ${x.field}:** ${x.reason}`).join("\n") : "_None._");

  // 14. Sources
  h2("Sources and timestamps");
  out.push(r.sources.map((s) => `- ${s.source}: ${s.detail}${s.fetchedAt ? ` (${fmtDate(s.fetchedAt, true)})` : ""}`).join("\n"));
  out.push("", `_Generated ${fmtDate(r.generatedAt, true)}; data last pulled ${fmtDate(r.dataPulledAt, true)}._`);

  // Appendix: grade inputs, so the number can be audited.
  const defs = featureDefs(p.position);
  out.push("\n<details><summary>Grade inputs</summary>\n");
  out.push(
    table(
      [
        { label: "Feature", get: (f) => defs.find((d) => d.key === f.key)?.label ?? f.key },
        { label: "Value", get: (f) => fmtFeature(f.value, defs.find((d) => d.key === f.key)?.format ?? "num2"), align: "right" },
        { label: "Percentile", get: (f) => (f.percentile == null ? f.note ?? "—" : fmtInt(f.percentile)), align: "right" },
      ],
      g.components.flatMap((c) => c.features),
    ),
  );
  out.push("\n</details>\n");
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
