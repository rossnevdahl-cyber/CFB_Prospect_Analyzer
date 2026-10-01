import { NextResponse, type NextRequest } from "next/server";
import { reportToMarkdown } from "@/lib/markdown";
import { PlayerNotFoundError } from "@/lib/report/build";
import { generateReport } from "@/lib/services";

export const maxDuration = 60;

/** Report as JSON (default) or Markdown (?format=md). ?refresh=1 bypasses the cache. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    const report = await generateReport(id, { refresh: sp.get("refresh") === "1" });
    if (sp.get("format") === "md") {
      return new NextResponse(reportToMarkdown(report, { baseUrl: req.nextUrl.origin }), {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }
    return NextResponse.json(report);
  } catch (e) {
    const status = e instanceof PlayerNotFoundError ? 404 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
