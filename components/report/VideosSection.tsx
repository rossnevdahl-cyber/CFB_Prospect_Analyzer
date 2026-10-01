"use client";

import { useState, useTransition } from "react";
import { addVideoLink, clearVideoOverride, hideVideo, pinVideo } from "@/app/actions/videos";
import type { Video } from "@/lib/adapters/youtube";
import { fmtDate, fmtDuration } from "@/lib/format";
import type { VideoSection as VideoSectionData } from "@/lib/report/types";
import { Section } from "./Section";

function VideoCard({ v, cfbdId, compact }: { v: Video; cfbdId: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className={`flex gap-3 ${compact ? "items-center" : "flex-col"}`}>
      <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={v.thumbnail ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" className={`${compact ? "w-28" : "w-full"} aspect-video rounded-lg object-cover`} />
      </a>
      <div className="min-w-0 flex-1 space-y-1">
        <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-medium hover:underline">
          {v.title}
        </a>
        <div className="text-xs text-muted">
          <span className={`pill mr-1 ${v.kind === "film" ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800"}`}>
            {v.kind === "film" ? "Film review" : "Highlights"}
          </span>
          {v.channel && `${v.channel} · `}
          {fmtDate(v.publishedAt)} · {fmtDuration(v.durationSec)}
          {v.pinned && " · 📌"}
        </div>
        <div className="flex gap-1">
          {v.pinned ? (
            <button className="btn-sm" disabled={pending} onClick={() => start(() => clearVideoOverride(cfbdId, v.id))}>
              {v.manual ? "Remove" : "Unpin"}
            </button>
          ) : (
            <button className="btn-sm" disabled={pending} onClick={() => start(() => pinVideo(cfbdId, v.id))}>
              Pin
            </button>
          )}
          {!v.manual && (
            <button className="btn-sm" disabled={pending} onClick={() => start(() => hideVideo(cfbdId, v.id))}>
              Hide
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function VideosSection({ cfbdId, videos }: { cfbdId: string; videos: VideoSectionData }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Section id="film" title="Film and highlights" aside={videos.fetchedAt && <span className="text-xs text-muted">searched {fmtDate(videos.fetchedAt)}</span>}>
      {videos.status !== "ok" && <p className="mb-3 text-xs text-amber-700">{videos.message}</p>}
      {videos.items.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {videos.items.map((v) => (
            <VideoCard key={v.id} v={v} cfbdId={cfbdId} />
          ))}
        </div>
      ) : (
        <p className="text-sm">
          No matching videos found.{" "}
          <a className="text-accent underline" href={videos.searchUrl} target="_blank" rel="noopener noreferrer">
            Search YouTube
          </a>
        </p>
      )}
      {videos.pool.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted">Other matches ({videos.pool.length})</summary>
          <div className="mt-3 space-y-3">
            {videos.pool.map((v) => (
              <VideoCard key={v.id} v={v} cfbdId={cfbdId} compact />
            ))}
          </div>
        </details>
      )}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await addVideoLink(cfbdId, link);
            setError(res.error ?? null);
            if (!res.error) setLink("");
          });
        }}
      >
        <input className="input" placeholder="Paste a YouTube link" value={link} onChange={(e) => setLink(e.target.value)} />
        <button className="btn" disabled={pending || !link.trim()}>
          Add
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </Section>
  );
}
