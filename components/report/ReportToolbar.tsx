"use client";

import { useState, useTransition } from "react";
import { addPlayerToBoard } from "@/app/actions/boards";
import { refreshReport } from "@/app/actions/report";
import type { BoardSpot } from "@/lib/report/types";

async function fetchMarkdown(cfbdId: string): Promise<string> {
  const res = await fetch(`/api/report?id=${encodeURIComponent(cfbdId)}&format=md`);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  return res.text();
}

export function ReportToolbar(props: { cfbdId: string; name: string; position: string; school: string; projectedDraftYear: number; board: BoardSpot | null }) {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [classYear, setClassYear] = useState(props.board?.classYear ?? props.projectedDraftYear);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2500);
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(await fetchMarkdown(props.cfbdId));
              flash("Markdown copied");
            } catch (e) {
              flash((e as Error).message);
            }
          }}
        >
          Copy markdown
        </button>
        <button
          className="btn"
          onClick={async () => {
            try {
              const md = await fetchMarkdown(props.cfbdId);
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
              a.download = `${props.name.replace(/[^\w]+/g, "-").toLowerCase()}-prospect-report.md`;
              a.click();
              URL.revokeObjectURL(a.href);
            } catch (e) {
              flash((e as Error).message);
            }
          }}
        >
          Download .md
        </button>
        <button
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await refreshReport(props.cfbdId);
              flash(res.error ?? "Data refreshed");
            })
          }
        >
          {pending ? "Refreshing…" : "Refresh data"}
        </button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <input
          type="number"
          className="input w-24 py-1"
          value={classYear}
          min={2020}
          max={2040}
          onChange={(e) => setClassYear(Number(e.target.value))}
          aria-label="Draft class"
        />
        <button
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await addPlayerToBoard(classYear, { cfbdId: props.cfbdId, name: props.name, position: props.position, school: props.school, tier: null });
              flash(`On the ${classYear} board`);
            })
          }
        >
          {props.board ? (props.board.classYear === classYear ? `On ${classYear} board` : `Move to ${classYear} board`) : "Add to board"}
        </button>
      </div>
      {status && <div className="text-xs text-muted">{status}</div>}
    </div>
  );
}
