import { describe, expect, it } from "vitest";
import { CfbdAdapter, isRateLimited, Limiter } from "@/lib/adapters/cfbd";
import { MemoryCache } from "@/lib/cache";

describe("Limiter", () => {
  it("never runs more than the limit at once", async () => {
    const lim = new Limiter(2);
    let active = 0, peak = 0;
    const task = () => lim.run(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    await Promise.all(Array.from({ length: 10 }, task));
    expect(peak).toBe(2);
  });
});

describe("CFBD rate limiting", () => {
  it("recognizes 429s and the concurrency message", () => {
    expect(isRateLimited({ response: new Response("", { status: 429 }) })).toBe(true);
    expect(isRateLimited({ error: { message: "Too many concurrent requests for this endpoint." } })).toBe(true);
    expect(isRateLimited({ error: { message: "Not found" } })).toBe(false);
  });

  it("retries a rate-limited call and caps concurrent requests", async () => {
    let calls = 0, refused = 0, active = 0, peak = 0;
    const fetch = async (req: Request) => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      // Every endpoint refuses its first request, like CFBD under load.
      if (calls <= 3) {
        refused++;
        return Response.json({ message: "Too many concurrent requests for this endpoint." }, { status: 429 });
      }
      return Response.json([{ year: Number(new URL(req.url).searchParams.get("year")), team: "X", rating: 1 }]);
    };
    const cfbd = new CfbdAdapter({ apiKey: "k", cache: new MemoryCache(), fetch, season: 2025, concurrency: 2, retryDelaysMs: [1, 1, 1, 1] });
    const results = await Promise.all([2019, 2020, 2021, 2022, 2023].map((y) => cfbd.sp(y)));
    expect(results.map((r) => r[0].year)).toEqual([2019, 2020, 2021, 2022, 2023]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(refused).toBeGreaterThan(0);
    expect(calls).toBe(5 + refused); // each refusal was retried once and then succeeded
  });

  it("gives up after the last retry with the CFBD message", async () => {
    const fetch = async () => Response.json({ message: "Too many concurrent requests for this endpoint." }, { status: 429 });
    const cfbd = new CfbdAdapter({ apiKey: "k", cache: new MemoryCache(), fetch, season: 2025, retryDelaysMs: [1, 1] });
    await expect(cfbd.sp(2020)).rejects.toThrow(/Too many concurrent/);
  });
});
