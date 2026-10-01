import { NextResponse, type NextRequest } from "next/server";
import { boardToCsv, boardToMarkdown } from "@/lib/boards";
import { boardGrades, getBoard, getSnapshot } from "@/lib/boardsRepo";

export async function GET(req: NextRequest, { params }: { params: Promise<{ classYear: string }> }) {
  const classYear = Number((await params).classYear);
  const sp = req.nextUrl.searchParams;
  const snap = sp.get("snapshot") ? await getSnapshot(classYear, Number(sp.get("snapshot"))) : null;
  const entries = snap?.entries ?? (await getBoard(classYear)).entries;
  const grades = await boardGrades(entries.map((e) => e.cfbdId));
  const asOf = snap?.takenAt.toISOString().slice(0, 10);
  if (sp.get("format") === "csv") {
    return new NextResponse(boardToCsv(entries, grades), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="board-${classYear}${asOf ? `-${asOf}` : ""}.csv"` },
    });
  }
  return new NextResponse(boardToMarkdown(classYear, entries, grades, asOf), {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="board-${classYear}${asOf ? `-${asOf}` : ""}.md"` },
  });
}
