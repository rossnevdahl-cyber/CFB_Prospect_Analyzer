"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { compareBoard, missingFromBoard, type ConsensusEntry } from "@/lib/consensus";
import type { BoardEntry } from "@/lib/boards";
import { fmtDate, fmtLeagueFormat, fmtNum } from "@/lib/format";

type Filter = "all" | "mine" | "fades";

export function GapBadge({ gap }: { gap: number | null | undefined }) {
  if (gap == null) return <span className="text-muted">—</span>;
  if (gap === 0) return <span className="tabular-nums text-muted">±0</span>;
  return <span className={`tabular-nums font-semibold ${gap > 0 ? "text-emerald-700" : "text-red-600"}`}>{gap > 0 ? `+${gap}` : gap}</span>;
}

/** Your board against the consensus of imported fantasy rookie rankings. */
export function ConsensusPanel(props: {
  entries: BoardEntry[];
  consensus: ConsensusEntry[];
  sources: { source: string; asOf: string }[];
  format: string;
  view: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const position = props.view && props.view !== "ALL" ? props.view : null;
  const rows = useMemo(() => {
    const cmp = compareBoard(props.entries, props.consensus, position);
    const byId = new Map(props.entries.map((e) => [e.cfbdId, e]));
    const list = cmp.map((c) => ({ ...c, entry: byId.get(c.cfbdId) as BoardEntry }));
    if (filter === "mine") return list.filter((r) => (r.gap ?? 0) > 0).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
    if (filter === "fades") return list.filter((r) => (r.gap ?? 0) < 0).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
    return list;
  }, [props.entries, props.consensus, position, filter]);
  const limit = position ? 15 : 50;
  const missing = useMemo(() => missingFromBoard(props.entries, props.consensus, limit, position), [props.entries, props.consensus, limit, position]);

  if (!props.sources.length) {
    return (
      <div className="card p-4 text-sm text-muted">
        No fantasy rookie rankings for this class in {fmtLeagueFormat(props.format)} yet.{" "}
        <Link className="text-accent underline" href="/imports">
          Import one
        </Link>{" "}
        to compare your board against consensus.
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="card-title mb-0">
          My board vs consensus{position ? ` — ${position}` : ""}
        </h2>
        <span className="text-xs text-muted">
          {fmtLeagueFormat(props.format)} · {props.sources.map((s) => `${s.source} (${fmtDate(s.asOf)})`).join(", ")}
        </span>
        <div className="ml-auto flex gap-1">
          {(
            [
              ["all", "All"],
              ["mine", "My guys"],
              ["fades", "Fades"],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button key={f} className={`btn-sm ${filter === f ? "border-accent text-accent" : ""}`} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">
        Gap = consensus rank − my rank{position ? " (positional)" : ""}. Green: you&apos;re higher than consensus. Red: you&apos;re lower. A source that
        doesn&apos;t rank a player counts as one past its last rank.
      </p>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="text-right">Mine</th>
              <th className="text-left">Player</th>
              <th className="text-right">Cons.</th>
              <th className="text-right">Gap</th>
              {props.sources.map((s) => (
                <th key={s.source} className="text-right">
                  {s.source}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cfbdId}>
                <td className="text-right tabular-nums">{r.myRank}</td>
                <td>
                  <Link className="hover:underline" href={`/player/${r.cfbdId}`}>
                    {r.entry.name}
                  </Link>
                  <span className="text-xs text-muted">
                    {" "}
                    {r.entry.position} · {r.entry.school}
                  </span>
                </td>
                <td className="text-right tabular-nums">{r.consensusRank ?? "—"}</td>
                <td className="text-right">
                  <GapBadge gap={r.gap} />
                </td>
                {props.sources.map((s) => (
                  <td key={s.source} className="text-right tabular-nums">
                    {r.sources[s.source] ?? <span className="text-muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4 + props.sources.length} className="text-muted">
                  {filter === "all" ? "No players on this board yet." : "Nobody in this group."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            Consensus top {limit}
            {position ? ` ${position}s` : ""} not on my board ({missing.length})
          </summary>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {missing.map((m) => (
              <li key={m.key}>
                <span className="tabular-nums text-muted">#{position ? m.positionRank : m.rank}</span>{" "}
                {m.cfbdId ? (
                  <Link className="hover:underline" href={`/player/${m.cfbdId}`}>
                    {m.name}
                  </Link>
                ) : (
                  m.name
                )}
                <span className="text-xs text-muted">
                  {" "}
                  {m.position} · {m.school} · avg {fmtNum(m.average, 1)}
                  {!m.cfbdId && " · not matched to CFBD"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
