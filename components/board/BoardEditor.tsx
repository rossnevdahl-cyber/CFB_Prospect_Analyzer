"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  movePlayer,
  movePlayerToClass,
  removePlayer,
  restoreSnapshot,
  saveTiers,
  setPlayerTier,
} from "@/app/actions/boards";
import {
  moveOverall,
  moveWithinPosition,
  positionOf,
  positionRanks,
  removeEntry,
  setTier,
  type BoardEntry,
  type BoardGrades,
  type BoardTier,
} from "@/lib/boards";
import { compareBoard, type ConsensusEntry } from "@/lib/consensus";
import { POSITIONS, type Position } from "@/lib/types";
import { ConsensusPanel, GapBadge } from "./ConsensusPanel";

type View = "ALL" | Position;

type RowProps = {
  entry: BoardEntry;
  overallRank: number;
  posRank: string;
  viewIndex: number;
  viewCount: number;
  divider: BoardTier | null | "none";
  tiers: BoardTier[];
  grade: { grade: number | null; tier: string | null } | undefined;
  consensus: { rank: number | null; gap: number | null } | null;
  readOnly: boolean;
  classYear: number;
  onMove: (cfbdId: string, toViewIndex: number) => void;
  onTier: (cfbdId: string, tier: string | null) => void;
  onRemove: (cfbdId: string) => void;
  onMoveClass: (cfbdId: string, toClass: number) => void;
};

function Row(p: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.entry.cfbdId, disabled: p.readOnly });
  const [rankInput, setRankInput] = useState("");
  const tierColor = p.tiers.find((t) => t.label === p.entry.tier)?.color;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "relative z-10 opacity-80" : ""}>
      {p.divider !== "none" && (
        <div className="mt-2 mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: p.divider?.color ?? "var(--muted)" }}>
          <span className="h-0.5 flex-1 rounded" style={{ background: p.divider?.color ?? "var(--border)" }} />
          {p.divider?.label ?? "Untiered"}
          <span className="h-0.5 flex-1 rounded" style={{ background: p.divider?.color ?? "var(--border)" }} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" style={{ borderLeft: `4px solid ${tierColor ?? "transparent"}` }}>
        {!p.readOnly && (
          <button {...attributes} {...listeners} className="cursor-grab touch-none px-1 text-muted active:cursor-grabbing" aria-label="Drag to reorder">
            ⠿
          </button>
        )}
        <span className="w-8 text-right font-bold tabular-nums">{p.overallRank}</span>
        <span className="w-12 text-xs text-muted tabular-nums">{p.posRank}</span>
        <Link href={`/player/${p.entry.cfbdId}`} className="min-w-0 flex-1 basis-40 truncate font-medium hover:underline">
          {p.entry.name}
          <span className="ml-2 text-xs font-normal text-muted">
            {p.entry.position} · {p.entry.school}
          </span>
        </Link>
        <span className="hidden w-20 text-right text-xs sm:inline">
          {p.grade?.grade != null ? (
            <>
              <strong className="tabular-nums">{p.grade.grade}</strong> <span className="text-muted">{p.grade.tier}</span>
            </>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>
        {p.consensus && (
          <span className="w-16 text-right text-xs" title="Consensus rank and gap (consensus − mine)">
            <span className="text-muted">C</span> <span className="tabular-nums">{p.consensus.rank ?? "—"}</span> <GapBadge gap={p.consensus.gap} />
          </span>
        )}
        {!p.readOnly && (
          <>
            <select className="input w-24 px-1 py-0.5 text-xs" value={p.entry.tier ?? ""} onChange={(e) => p.onTier(p.entry.cfbdId, e.target.value || null)} aria-label="My tier">
              <option value="">No tier</option>
              {p.tiers.map((t) => (
                <option key={t.label}>{t.label}</option>
              ))}
            </select>
            <button className="btn-sm" disabled={p.viewIndex === 0} onClick={() => p.onMove(p.entry.cfbdId, p.viewIndex - 1)} aria-label="Move up">
              ↑
            </button>
            <button className="btn-sm" disabled={p.viewIndex === p.viewCount - 1} onClick={() => p.onMove(p.entry.cfbdId, p.viewIndex + 1)} aria-label="Move down">
              ↓
            </button>
            <form
              className="hidden sm:block"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(rankInput);
                if (n >= 1) p.onMove(p.entry.cfbdId, n - 1);
                setRankInput("");
              }}
            >
              <input className="input w-14 px-1 py-0.5 text-xs" inputMode="numeric" placeholder="#" value={rankInput} onChange={(e) => setRankInput(e.target.value)} aria-label="Move to rank" />
            </form>
            <details className="relative">
              <summary className="btn-sm cursor-pointer list-none">⋯</summary>
              <div className="absolute right-0 z-20 mt-1 w-48 space-y-2 rounded-lg border border-border bg-surface p-2 shadow-lg">
                <form
                  className="flex gap-1 sm:hidden"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Number(new FormData(e.currentTarget).get("rank"));
                    if (n >= 1) p.onMove(p.entry.cfbdId, n - 1);
                  }}
                >
                  <input name="rank" className="input py-0.5 text-xs" inputMode="numeric" placeholder="Move to rank #" />
                  <button className="btn-sm">Go</button>
                </form>
                <form
                  className="flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const y = Number(new FormData(e.currentTarget).get("year"));
                    if (y && y !== p.classYear) p.onMoveClass(p.entry.cfbdId, y);
                  }}
                >
                  <input name="year" type="number" defaultValue={p.classYear + 1} className="input py-0.5 text-xs" aria-label="Move to class" />
                  <button className="btn-sm whitespace-nowrap">Move class</button>
                </form>
                <button className="btn-sm w-full text-red-600" onClick={() => p.onRemove(p.entry.cfbdId)}>
                  Remove from board
                </button>
              </div>
            </details>
          </>
        )}
      </div>
    </li>
  );
}

function TierEditor({ classYear, tiers, onSaved }: { classYear: number; tiers: BoardTier[]; onSaved: (t: BoardTier[]) => void }) {
  const [draft, setDraft] = useState(tiers);
  const [pending, start] = useTransition();
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-medium">Tier labels</summary>
      <div className="mt-3 space-y-2">
        {draft.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="color" value={t.color} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
            <input className="input max-w-xs py-1" value={t.label} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <button className="btn-sm" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <button className="btn-sm" onClick={() => setDraft([...draft, { label: `Tier ${draft.length + 1}`, color: "#64748b" }])}>
            Add tier
          </button>
          <button
            className="btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await saveTiers(classYear, draft);
                onSaved(draft);
              })
            }
          >
            Save tiers
          </button>
        </div>
      </div>
    </details>
  );
}

export function BoardEditor(props: {
  classYear: number;
  initialEntries: BoardEntry[];
  tiers: BoardTier[];
  grades: BoardGrades;
  readOnly: boolean;
  initialView: string;
  snapshotId: number | null;
  consensus: ConsensusEntry[];
  sources: { source: string; asOf: string }[];
  format: string;
}) {
  const [entries, setEntries] = useState(props.initialEntries);
  const [tiers, setTiers] = useState(props.tiers);
  const [view, setView] = useState<View>((["ALL", ...POSITIONS] as string[]).includes(props.initialView) ? (props.initialView as View) : "ALL");
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = useMemo(() => (view === "ALL" ? entries : entries.filter((e) => positionOf(e) === view)), [entries, view]);
  const posRanks = useMemo(() => positionRanks(entries), [entries]);
  const overall = useMemo(() => new Map(entries.map((e, i) => [e.cfbdId, i + 1])), [entries]);
  const comparison = useMemo(
    () => (props.sources.length ? new Map(compareBoard(entries, props.consensus, view === "ALL" ? null : view).map((c) => [c.cfbdId, { rank: c.consensusRank, gap: c.gap }])) : null),
    [entries, props.consensus, props.sources.length, view],
  );

  /** Optimistic local update with the same pure function the server applies, then reconcile. */
  const run = (local: BoardEntry[], server: () => Promise<BoardEntry[] | void>) => {
    const before = entries;
    setEntries(local);
    start(async () => {
      try {
        const res = await server();
        if (res) setEntries(res);
      } catch (e) {
        setEntries(before);
        setError((e as Error).message);
      }
    });
  };

  const onMove = (cfbdId: string, toViewIndex: number) => {
    const idx = Math.max(0, Math.min(toViewIndex, visible.length - 1));
    const local = view === "ALL" ? moveOverall(entries, cfbdId, idx) : moveWithinPosition(entries, view, cfbdId, idx);
    run(local, () => movePlayer(props.classYear, cfbdId, idx, view === "ALL" ? null : view));
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const to = visible.findIndex((x) => x.cfbdId === e.over!.id);
    onMove(String(e.active.id), to);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {(["ALL", ...POSITIONS] as View[]).map((v) => (
          <button key={v} className={`btn ${view === v ? "border-accent text-accent" : ""}`} onClick={() => setView(v)}>
            {v === "ALL" ? "All" : v}
            <span className="text-xs text-muted">{v === "ALL" ? entries.length : entries.filter((e) => positionOf(e) === v).length}</span>
          </button>
        ))}
        {props.readOnly && props.snapshotId && (
          <button className="btn ml-auto" onClick={() => start(() => restoreSnapshot(props.classYear, entries, tiers))}>
            Restore this snapshot
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!visible.length && <p className="card p-4 text-sm text-muted">No players {view === "ALL" ? "on this board yet — use “Add to board” on a report." : `at ${view}.`}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((e) => e.cfbdId)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-1">
            {visible.map((e, i) => {
              const showDivider = i === 0 ? e.tier != null : e.tier !== visible[i - 1].tier;
              return (
                <Row
                  key={e.cfbdId}
                  entry={e}
                  overallRank={overall.get(e.cfbdId) ?? i + 1}
                  posRank={posRanks.get(e.cfbdId) ?? ""}
                  viewIndex={i}
                  viewCount={visible.length}
                  divider={showDivider ? (tiers.find((t) => t.label === e.tier) ?? null) : "none"}
                  tiers={tiers}
                  grade={props.grades[e.cfbdId]}
                  consensus={comparison?.get(e.cfbdId) ?? null}
                  readOnly={props.readOnly}
                  classYear={props.classYear}
                  onMove={onMove}
                  onTier={(id, tier) => run(setTier(entries, id, tier), () => setPlayerTier(props.classYear, id, tier))}
                  onRemove={(id) => {
                    if (confirm("Remove this player from the board?")) run(removeEntry(entries, id), () => removePlayer(props.classYear, id));
                  }}
                  onMoveClass={(id, y) => run(removeEntry(entries, id), () => movePlayerToClass(props.classYear, id, y))}
                />
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
      <ConsensusPanel entries={entries} consensus={props.consensus} sources={props.sources} format={props.format} view={view} />
      {!props.readOnly && <TierEditor classYear={props.classYear} tiers={tiers} onSaved={setTiers} />}
    </div>
  );
}
