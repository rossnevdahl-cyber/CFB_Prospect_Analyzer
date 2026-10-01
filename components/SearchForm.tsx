"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { findPlayer } from "@/app/actions/search";
import { CLASS_LABELS, POSITIONS } from "@/lib/types";

type Suggestion = { cfbdId: string; name: string; team: string; position: string | null; classYear: number | null };

export function SearchForm({ teams }: { teams: { school: string; conference: string | null }[] }) {
  const [state, action, pending] = useActionState(findPlayer, undefined);
  const [name, setName] = useState(state?.query?.name ?? "");
  const [team, setTeam] = useState(state?.query?.team ?? "");
  const [position, setPosition] = useState(state?.query?.position ?? "WR");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (name.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      const qs = new URLSearchParams({ q: name, team, position });
      const res = await fetch(`/api/players?${qs}`).catch(() => null);
      if (res?.ok) setSuggestions(await res.json());
    }, 200);
  }, [name, team, position]);

  return (
    <div className="space-y-6">
      <form action={action} className="card grid gap-4 p-5 md:grid-cols-[2fr_2fr_1fr_auto] md:items-end">
        <label className="relative block">
          <span className="label">Name</span>
          <input
            name="name"
            className="input mt-1"
            value={name}
            autoComplete="off"
            placeholder="e.g. Jeremiah Smith"
            onChange={(e) => {
              setName(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && name.trim().length >= 2 && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
              {suggestions.map((s) => (
                <li key={s.cfbdId}>
                  <button
                    type="button"
                    className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-background"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setName(s.name);
                      setTeam(s.team);
                      if (s.position && (POSITIONS as readonly string[]).includes(s.position)) setPosition(s.position);
                      setOpen(false);
                    }}
                  >
                    <span>{s.name}</span>
                    <span className="text-muted">
                      {s.position} · {s.team}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
        <label className="block">
          <span className="label">College</span>
          <input name="team" list="fbs-teams" className="input mt-1" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Any FBS team" />
          <datalist id="fbs-teams">
            {teams.map((t) => (
              <option key={t.school} value={t.school}>
                {t.conference ?? ""}
              </option>
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="label">Position</span>
          <select name="position" className="input mt-1" value={position} onChange={(e) => setPosition(e.target.value)}>
            {POSITIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <button className="btn-primary h-[38px]" disabled={pending}>
          {pending ? "Searching…" : "Generate report"}
        </button>
      </form>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state?.candidates && (
        <div className="card p-5">
          <h2 className="card-title">Did you mean…</h2>
          <form action={action}>
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left">Name</th>
                  <th className="text-left">School</th>
                  <th className="text-left">Pos</th>
                  <th className="text-left">Class</th>
                  <th className="text-right">Match</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.candidates.map((c) => (
                  <tr key={c.cfbdId}>
                    <td>{c.name}</td>
                    <td>{c.team}</td>
                    <td>{c.position ?? "—"}</td>
                    <td>
                      {c.classYear != null ? CLASS_LABELS[c.classYear] ?? c.classYear : "—"} ({c.season})
                    </td>
                    <td className="text-right">{Math.round(c.nameScore * 100)}%</td>
                    <td className="text-right">
                      <button name="cfbdId" value={c.cfbdId} className="btn-sm">
                        Open report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </form>
        </div>
      )}
    </div>
  );
}
