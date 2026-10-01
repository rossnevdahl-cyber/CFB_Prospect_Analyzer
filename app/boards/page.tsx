import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { listBoards } from "@/lib/boardsRepo";
import { currentSeason } from "@/lib/metrics";

export default async function BoardsIndex() {
  await connection();
  const boards = await listBoards().catch(() => []);
  const next = currentSeason() + 1;
  async function open(form: FormData) {
    "use server";
    redirect(`/boards/${Number(form.get("classYear")) || next}`);
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Big boards</h1>
      <div className="card p-5">
        <ul className="space-y-1">
          {boards.map((b) => (
            <li key={b.classYear}>
              <Link className="text-accent underline" href={`/boards/${b.classYear}`}>
                {b.classYear} class
              </Link>{" "}
              <span className="text-sm text-muted">({b.count} players)</span>
            </li>
          ))}
          {!boards.length && <li className="text-sm text-muted">No boards yet — add players from a report.</li>}
        </ul>
        <form action={open} className="mt-4 flex gap-2">
          <input name="classYear" type="number" defaultValue={next} className="input w-32" />
          <button className="btn">Open class board</button>
        </form>
      </div>
    </div>
  );
}
