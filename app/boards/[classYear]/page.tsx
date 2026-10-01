import Link from "next/link";
import { notFound } from "next/navigation";
import { BoardEditor } from "@/components/board/BoardEditor";
import { boardGrades, getBoard, getSnapshot, listBoards, listSnapshots, searchNotes, snapshotAsOf } from "@/lib/boardsRepo";
import { fmtDate } from "@/lib/format";

type SP = Promise<{ view?: string; snapshot?: string; asOf?: string; q?: string }>;

export default async function BoardPage({ params, searchParams }: { params: Promise<{ classYear: string }>; searchParams: SP }) {
  const { classYear: cy } = await params;
  const classYear = Number(cy);
  if (!Number.isInteger(classYear) || classYear < 2000 || classYear > 2100) notFound();
  const sp = await searchParams;
  const board = await getBoard(classYear);
  const snapshot = sp.snapshot ? await getSnapshot(classYear, Number(sp.snapshot)) : sp.asOf ? await snapshotAsOf(classYear, sp.asOf) : null;
  const shown = snapshot ? { ...board, entries: snapshot.entries, tiers: snapshot.tiers } : board;
  const [grades, snapshots, allBoards, noteHits] = await Promise.all([
    boardGrades(shown.entries.map((e) => e.cfbdId)),
    listSnapshots(classYear),
    listBoards(),
    sp.q ? searchNotes(sp.q) : Promise.resolve(null),
  ]);
  const exportQs = snapshot ? `&snapshot=${snapshot.id}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{classYear} big board</h1>
        <div className="flex gap-1 text-sm">
          {allBoards
            .filter((b) => b.classYear !== classYear)
            .map((b) => (
              <Link key={b.classYear} className="btn-sm" href={`/boards/${b.classYear}`}>
                {b.classYear}
              </Link>
            ))}
        </div>
        <div className="ml-auto flex gap-2">
          <a className="btn" href={`/api/boards/${classYear}?format=md${exportQs}`}>
            Export .md
          </a>
          <a className="btn" href={`/api/boards/${classYear}?format=csv${exportQs}`}>
            Export CSV
          </a>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-4 p-4 text-sm">
        <form className="flex items-end gap-2">
          <label>
            <span className="label">View board as of</span>
            <input type="date" name="asOf" defaultValue={sp.asOf} className="input mt-1" />
          </label>
          <button className="btn">Go</button>
        </form>
        <form className="flex items-end gap-2">
          <label>
            <span className="label">Snapshot</span>
            <select name="snapshot" defaultValue={snapshot?.id ?? ""} className="input mt-1">
              <option value="">Current board</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmtDate(s.takenAt.toISOString(), true)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn">Load</button>
        </form>
        <form className="ml-auto flex items-end gap-2">
          <label>
            <span className="label">Search notes (all players)</span>
            <input name="q" defaultValue={sp.q} className="input mt-1" placeholder="e.g. route running" />
          </label>
          <button className="btn">Search</button>
        </form>
      </div>

      {noteHits && (
        <div className="card p-4">
          <h2 className="card-title">
            Notes matching “{sp.q}” ({noteHits.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {noteHits.map((n) => (
              <li key={n.id}>
                <Link className="font-medium text-accent underline" href={`/player/${n.cfbdId}#notes`}>
                  {n.playerName || n.cfbdId}
                </Link>{" "}
                <span className="text-xs text-muted">{fmtDate(n.createdAt.toISOString(), true)}</span>
                <div className="line-clamp-2 text-muted">{n.body}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {snapshot && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Viewing the board as saved {fmtDate(snapshot.takenAt.toISOString(), true)} (read-only).{" "}
          <Link className="underline" href={`/boards/${classYear}`}>
            Back to current
          </Link>
        </p>
      )}

      <BoardEditor
        key={snapshot ? `snap-${snapshot.id}` : `live-${board.updatedAt?.toISOString() ?? "new"}`}
        classYear={classYear}
        initialEntries={shown.entries}
        tiers={shown.tiers}
        grades={grades}
        readOnly={Boolean(snapshot)}
        initialView={sp.view ?? "ALL"}
        snapshotId={snapshot?.id ?? null}
      />
    </div>
  );
}
