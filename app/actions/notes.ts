"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { notes } from "@/lib/db/schema";

export async function addNote(cfbdId: string, playerName: string, body: string) {
  const text = body.trim();
  if (!text) return;
  await getDb().insert(notes).values({ cfbdId, playerName, body: text });
  revalidatePath(`/player/${cfbdId}`);
}

export async function editNote(id: number, cfbdId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  await getDb().update(notes).set({ body: text, updatedAt: new Date() }).where(eq(notes.id, id));
  revalidatePath(`/player/${cfbdId}`);
}

export async function deleteNote(id: number, cfbdId: string) {
  await getDb().delete(notes).where(eq(notes.id, id));
  revalidatePath(`/player/${cfbdId}`);
}
