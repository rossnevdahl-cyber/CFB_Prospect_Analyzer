import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyOverrides, classify, matchStrength, parseDuration, parseYouTubeId, searchQueries, selectVideos, YouTubeAdapter, type VideoOverride } from "@/lib/adapters/youtube";
import { composeSection, searchAndSelect } from "@/lib/videos";

const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "youtube", "test-receiver.json"), "utf8"));

function ytFetch() {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(url.pathname + "?" + url.searchParams.get("q"));
    if (url.pathname.endsWith("/search")) {
      const q = url.searchParams.get("q") ?? "";
      return Response.json(q.includes("highlights") ? fx.search1 : fx.search2);
    }
    const ids = (url.searchParams.get("id") ?? "").split(",");
    return Response.json({ items: fx.videos.items.filter((v: { id: string }) => ids.includes(v.id)) });
  }) as typeof fetch;
  return { f, calls };
}

const player = { cfbdId: "4870001", name: "Test Receiver", team: "Oregon", season: 2025 };

describe("youtube helpers", () => {
  it("builds the two spec queries", () => {
    expect(searchQueries("Test Receiver", "Oregon")).toEqual(['"Test Receiver" Oregon highlights', '"Test Receiver" film breakdown OR scouting report']);
  });
  it("parses ISO durations and video ids", () => {
    expect(parseDuration("PT1H2M3S")).toBe(3723);
    expect(parseDuration("PT40S")).toBe(40);
    expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeId("not a link")).toBeNull();
  });
  it("classifies film reviews", () => {
    expect(classify("X Film Breakdown")).toBe("film");
    expect(classify("Inside the Film Room")).toBe("film");
    expect(classify("2025 Highlights")).toBe("highlight");
  });
  it("scores match strength", () => {
    expect(matchStrength({ title: "Test Receiver highlights", description: "" }, "Test Receiver", "Oregon")).toBe(2);
    expect(matchStrength({ title: "Receiver mix | Oregon Ducks", description: "" }, "Test Receiver", "Oregon")).toBe(1);
    expect(matchStrength({ title: "Another Player", description: "" }, "Test Receiver", "Oregon")).toBe(0);
  });
});

describe("search and selection (fixtures)", () => {
  it("filters Shorts, full games and wrong players; picks 2 highlights + 1 film", async () => {
    const { f, calls } = ytFetch();
    const yt = new YouTubeAdapter("key", f);
    const res = await searchAndSelect(yt, player);
    expect(calls.filter((c) => c.startsWith("/youtube/v3/search"))).toHaveLength(2);
    const ids = res.items.map((v) => v.id);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain("aaaaaaaaaa4"); // Short
    expect(ids).not.toContain("aaaaaaaaaa5"); // 3-hour full game
    expect([...ids, ...res.pool.map((v) => v.id)]).not.toContain("aaaaaaaaaa6"); // other player
    expect(res.items.filter((v) => v.kind === "highlight")).toHaveLength(2);
    expect(res.items.filter((v) => v.kind === "film")).toHaveLength(1);
    // Full-name matches outrank the last-name + college match, despite its views
    expect(ids).not.toContain("aaaaaaaaaa3");
    // Both reels are from the current or last season, so views break the tie.
    expect(ids.slice(0, 2)).toEqual(["aaaaaaaaaa7", "aaaaaaaaaa1"]);
  });

  it("shows what qualifies when fewer than 3 do", () => {
    const raw = [{ id: "x1", title: "Test Receiver highlights", description: "", channel: "c", publishedAt: "2025-01-01", durationSec: 300, views: 1, thumbnail: null }];
    expect(selectVideos(raw, "Test Receiver", "Oregon", 2025)).toHaveLength(1);
    expect(selectVideos([], "Test Receiver", "Oregon", 2025)).toHaveLength(0);
  });

  it("a hidden video stays hidden after a refresh; pins and pasted links lead", async () => {
    const { f } = ytFetch();
    const yt = new YouTubeAdapter("key", f);
    const first = await searchAndSelect(yt, player);
    const hiddenId = first.items[0].id;
    const overrides: VideoOverride[] = [
      { videoId: hiddenId, action: "hide", video: null },
      { videoId: "aaaaaaaaaa8", action: "pin", video: null },
    ];
    const refreshed = await searchAndSelect(yt, player); // Refresh data re-runs the search
    const section = composeSection(player, refreshed, overrides, new Date(), "ok");
    expect(section.items.map((v) => v.id)).not.toContain(hiddenId);
    expect(section.pool.map((v) => v.id)).not.toContain(hiddenId);
    expect(section.items[0].id).toBe("aaaaaaaaaa8");
    expect(section.items[0].pinned).toBe(true);
    expect(section.items).toHaveLength(3);

    const manual = { ...first.items[1], id: "manual00001", title: "Pasted", manual: true };
    const withManual = applyOverrides(refreshed.items, refreshed.pool, [...overrides, { videoId: "manual00001", action: "add", video: manual }]);
    expect(withManual[0].id).toBe("manual00001");
  });
});
