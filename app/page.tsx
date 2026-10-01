import { connection } from "next/server";
import { SearchForm } from "@/components/SearchForm";
import { hasDatabase } from "@/lib/db";
import { listTeams } from "@/lib/search";

export default async function Home() {
  await connection();
  let teams: { school: string; conference: string | null }[] = [];
  let warning: string | null = null;
  if (!hasDatabase()) warning = "DATABASE_URL is not set — search and reports need Postgres.";
  else {
    try {
      teams = await listTeams();
    } catch (e) {
      warning = `Could not load teams: ${(e as Error).message}`;
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prospect report</h1>
        <p className="text-sm text-muted">
          Any active FBS QB, RB, WR or TE. Full PPR · superflex · 5-pt passing TDs.
        </p>
      </div>
      {warning && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>}
      <SearchForm teams={teams} />
    </div>
  );
}
