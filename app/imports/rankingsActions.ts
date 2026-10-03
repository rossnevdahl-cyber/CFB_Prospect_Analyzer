"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { previewRankings, RANKING_FORMATS, saveRankings, type Preview } from "@/lib/rankings";

const MAX_TEXT = 2_000_000;

export async function previewRankingsAction(text: string): Promise<{ preview?: Preview; error?: string }> {
  if (!text.trim()) return { error: "Paste a ranking or choose a file first." };
  if (text.length > MAX_TEXT) return { error: "That is more text than a ranking needs (2 MB max)." };
  try {
    const preview = await previewRankings(text);
    if (!preview.rows.length) return { error: "No players found. Expected lines like “Jeremiah Smith, WR, Ohio State”, ranking cards, or a CSV with a Player column." };
    return { preview };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const saveSchema = z.object({
  source: z.string().trim().min(1, "Name the source").max(80),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(RANKING_FORMATS),
  classYear: z.number().int().min(2000).max(2100),
  rows: z
    .array(
      z.object({
        rank: z.number().int().positive(),
        name: z.string().min(1),
        position: z.string().nullable(),
        school: z.string().nullable(),
        nflRank: z.number().int().positive().nullable(),
        cfbdId: z.string().nullable(),
      }),
    )
    .min(1)
    .max(2000),
});

export async function saveRankingsAction(input: z.input<typeof saveSchema>): Promise<{ saved?: number; matched?: number; nflRanks?: number; error?: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid import" };
  try {
    const res = await saveRankings(parsed.data);
    revalidatePath("/imports");
    revalidatePath(`/boards/${parsed.data.classYear}`);
    return res;
  } catch (e) {
    return { error: (e as Error).message };
  }
}
