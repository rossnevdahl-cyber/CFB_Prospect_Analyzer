"use client";

import { useState, useTransition } from "react";
import { addNote, deleteNote, editNote } from "@/app/actions/notes";
import { fmtDate } from "@/lib/format";
import { renderNote } from "@/lib/noteMarkdown";
import type { Note } from "@/lib/report/types";
import { Section } from "./Section";

export function NotesSection({ cfbdId, playerName, notes }: { cfbdId: string; playerName: string; notes: Note[] }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [pending, start] = useTransition();

  return (
    <Section id="notes" title="My notes">
      <div className="space-y-2">
        <textarea
          className="input min-h-24 font-mono"
          placeholder="Add a note (markdown supported)…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          className="btn-primary"
          disabled={pending || !draft.trim()}
          onClick={() =>
            start(async () => {
              await addNote(cfbdId, playerName, draft);
              setDraft("");
            })
          }
        >
          Add note
        </button>
      </div>
      <ul className="mt-4 space-y-4">
        {notes.map((n) => (
          <li key={n.id} className="border-t border-border pt-3">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted">
              <span>{fmtDate(n.createdAt, true)}</span>
              {n.updatedAt && <span>· edited {fmtDate(n.updatedAt, true)}</span>}
              <span className="ml-auto flex gap-1">
                <button
                  className="btn-sm"
                  onClick={() => {
                    setEditing(n.id);
                    setEditText(n.body);
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn-sm"
                  onClick={() => {
                    if (confirm("Delete this note?")) start(() => deleteNote(n.id, cfbdId));
                  }}
                >
                  Delete
                </button>
              </span>
            </div>
            {editing === n.id ? (
              <div className="space-y-2">
                <textarea className="input min-h-24 font-mono" value={editText} onChange={(e) => setEditText(e.target.value)} />
                <div className="flex gap-2">
                  <button
                    className="btn-primary"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await editNote(n.id, cfbdId, editText);
                        setEditing(null);
                      })
                    }
                  >
                    Save
                  </button>
                  <button className="btn" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="prose-note text-sm" dangerouslySetInnerHTML={{ __html: renderNote(n.body) }} />
            )}
          </li>
        ))}
        {!notes.length && <li className="text-sm text-muted">No notes yet.</li>}
      </ul>
    </Section>
  );
}
