"use server";

import { redirect } from "next/navigation";
import { searchPlayers } from "@/lib/search";
import type { ScoredCandidate } from "@/lib/names";
import { positionSchema } from "@/lib/types";

export type SearchState = { candidates?: ScoredCandidate[]; error?: string; query?: { name: string; team: string; position: string } } | undefined;

/** Exact match → straight to the report. Otherwise a pick list of close matches. */
export async function findPlayer(_prev: SearchState, form: FormData): Promise<SearchState> {
  const name = String(form.get("name") ?? "").trim();
  const team = String(form.get("team") ?? "").trim();
  const pos = positionSchema.safeParse(String(form.get("position") ?? ""));
  const query = { name, team, position: pos.success ? pos.data : "" };
  const chosen = String(form.get("cfbdId") ?? "");
  if (chosen) redirect(`/player/${chosen}`);
  if (name.length < 2) return { error: "Enter a player name.", query };
  let res;
  try {
    res = await searchPlayers({ name, team: team || undefined, position: pos.success ? pos.data : undefined });
  } catch (e) {
    return { error: (e as Error).message, query };
  }
  if (res.exact) redirect(`/player/${res.exact.cfbdId}`);
  if (!res.candidates.length) return { error: `No ${query.position || "player"} matching “${name}”${team ? ` at ${team}` : ""}.`, query };
  return { candidates: res.candidates, query };
}
