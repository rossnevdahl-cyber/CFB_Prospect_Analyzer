import { NextResponse, type NextRequest } from "next/server";
import { autocomplete } from "@/lib/search";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const team = req.nextUrl.searchParams.get("team") || undefined;
  const position = req.nextUrl.searchParams.get("position") || undefined;
  try {
    return NextResponse.json(await autocomplete(q, team, position));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
