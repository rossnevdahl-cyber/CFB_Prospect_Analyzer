"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { parseYouTubeId, YouTubeAdapter, classify, type Video } from "@/lib/adapters/youtube";
import { getDb } from "@/lib/db";
import { videoOverrides } from "@/lib/db/schema";

async function upsert(cfbdId: string, videoId: string, action: "pin" | "hide" | "add", video: Video | null = null) {
  await getDb()
    .insert(videoOverrides)
    .values({ cfbdId, videoId, action, video })
    .onConflictDoUpdate({ target: [videoOverrides.cfbdId, videoOverrides.videoId], set: { action, video, createdAt: new Date() } });
  revalidatePath(`/player/${cfbdId}`);
}

export async function pinVideo(cfbdId: string, videoId: string) {
  await upsert(cfbdId, videoId, "pin");
}

export async function hideVideo(cfbdId: string, videoId: string) {
  await upsert(cfbdId, videoId, "hide");
}

export async function clearVideoOverride(cfbdId: string, videoId: string) {
  await getDb().delete(videoOverrides).where(and(eq(videoOverrides.cfbdId, cfbdId), eq(videoOverrides.videoId, videoId)));
  revalidatePath(`/player/${cfbdId}`);
}

/** "Paste a YouTube link": stored as a pinned manual video, looked up for title and thumbnail when possible. */
export async function addVideoLink(cfbdId: string, link: string): Promise<{ error?: string }> {
  const id = parseYouTubeId(link);
  if (!id) return { error: "That doesn't look like a YouTube link." };
  let video: Video = {
    id,
    title: `YouTube video ${id}`,
    description: "",
    channel: "",
    publishedAt: new Date().toISOString(),
    durationSec: null,
    views: null,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    kind: "highlight",
    matchStrength: 2,
  };
  const yt = new YouTubeAdapter(process.env.YOUTUBE_API_KEY);
  if (yt.configured) {
    const [meta] = await yt.videosById([id]).catch(() => []);
    if (meta) video = { ...meta, kind: classify(meta.title), matchStrength: 2 };
  }
  await upsert(cfbdId, id, "add", { ...video, manual: true });
  return {};
}
