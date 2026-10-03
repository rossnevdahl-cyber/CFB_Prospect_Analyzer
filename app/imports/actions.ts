"use server";

import { revalidatePath } from "next/cache";
import { importAdp, importPff, type ImportResult } from "@/lib/imports";

export type ImportState = { result?: ImportResult; error?: string } | undefined;

export async function uploadCsv(_prev: ImportState, form: FormData): Promise<ImportState> {
  const kind = String(form.get("kind"));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 5 * 1024 * 1024) return { error: "File is over 5 MB." };
  const text = await file.text();
  const today = new Date().toISOString().slice(0, 10);
  const asOf = String(form.get("asOf") || today);
  const source = String(form.get("source") || "").trim();
  try {
    let result: ImportResult;
    if (kind === "pff") {
      const season = Number(form.get("season"));
      if (!season) return { error: "Season is required for PFF exports." };
      result = await importPff(text, file.name, season);
    } else if (kind === "adp") {
      if (!source) return { error: "Name the source (e.g. FantasyPros)." };
      result = await importAdp(text, file.name, source, asOf, String(form.get("format") || "superflex"));
    } else return { error: "Unknown import type." };
    revalidatePath("/imports");
    return { result };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
