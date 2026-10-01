"use server";

import { revalidatePath } from "next/cache";
import { generateReport } from "@/lib/services";

/** Refresh data: bypasses every cache (CFBD and YouTube) and rebuilds the report. */
export async function refreshReport(cfbdId: string): Promise<{ error?: string }> {
  try {
    await generateReport(cfbdId, { refresh: true });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/player/${cfbdId}`);
  return {};
}
