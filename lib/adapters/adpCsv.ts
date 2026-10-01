import { firstOf, parseCsv, toNumber, type CsvIssue } from "./csv";

export type AdpRow = { playerName: string; school: string | null; position: string | null; adp: number };

/** Parses a dynasty rookie ADP CSV: player and ADP required. Format (superflex/1QB) comes from the form. */
export function parseAdpCsv(text: string): { rows: AdpRow[]; issues: CsvIssue[] } {
  const rows: AdpRow[] = [];
  const issues: CsvIssue[] = [];
  parseCsv(text).forEach((r, i) => {
    const playerName = firstOf(r, "player", "player_name", "name");
    const adp = toNumber(firstOf(r, "adp", "avg", "average", "average_pick", "avg_pick", "rookie_adp"));
    if (!playerName || adp == null) {
      issues.push({ line: i + 2, message: "needs player and ADP" });
      return;
    }
    rows.push({
      playerName,
      school: firstOf(r, "school", "college", "team") ?? null,
      position: (firstOf(r, "position", "pos") ?? "").replace(/\d+$/, "") || null,
      adp,
    });
  });
  return { rows, issues };
}
