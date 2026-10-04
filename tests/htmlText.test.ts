import { describe, expect, it } from "vitest";
import { htmlFromMhtml, htmlToText, isMhtml, uploadedFileText } from "@/lib/adapters/htmlText";
import { parseRankingsText } from "@/lib/adapters/rankingsText";

const cards = `<div class="flex"><span>1</span><a>Jeremiah Smith</a><span>WR</span><span>Ohio State</span><span>UDFA</span><span>BB #1</span></div>
<div class="flex"><span>2</span><a>Trey&#39;Dez Green</a><span>TE</span><span>LSU</span><span>UDFA</span><span>BB #20</span></div>
<div class="ad"><p>Fantasy Hub</p><p>Open the Hub &rarr;</p></div>
<div class="flex"><span>3</span><a>Darian Mensah</a><span>QB</span><span>Miami (FL)</span><span>UDFA</span><span>BB #7</span></div>`;
const page = `<!DOCTYPE html><html><head><title>2027 Rankings</title><style>.x{}</style></head><body><nav>Sign In</nav>${cards}<script>var a="<span>9</span>";</script></body></html>`;

const mhtml = (body: string, encoding: "binary" | "quoted-printable") => `From: <Saved by Blink>
Snapshot-Content-Location: https://www.nflmockdraftdatabase.com/fantasy-rookie-rankings-2027?league=superflex
MIME-Version: 1.0
Content-Type: multipart/related;
\ttype="text/html";
\tboundary="----MultipartBoundary--abc----"

------MultipartBoundary--abc----
Content-Type: text/html
Content-Transfer-Encoding: ${encoding}
Content-Location: https://www.nflmockdraftdatabase.com/fantasy-rookie-rankings-2027

${body}
------MultipartBoundary--abc----
Content-Type: text/css
Content-Transfer-Encoding: binary

.x { color: red }
------MultipartBoundary--abc------
`;

/** Minimal quoted-printable encoder for the test: escapes "=" and non-ASCII, soft-wraps long lines. */
function qp(s: string): string {
  const enc = [...new TextEncoder().encode(s)].map((b) => (b === 61 || b > 126 ? `=${b.toString(16).toUpperCase().padStart(2, "0")}` : String.fromCharCode(b))).join("");
  return enc.replace(/(.{70})/g, "$1=\n");
}

describe("saved web pages", () => {
  it("reduces HTML to one visible field per line", () => {
    const t = htmlToText(page);
    expect(t).not.toContain("2027 Rankings");
    expect(t).not.toContain("<span>9</span>");
    expect(t.split("\n").slice(0, 7)).toEqual(["Sign In", "1", "Jeremiah Smith", "WR", "Ohio State", "UDFA", "BB #1"]);
    expect(t).toContain("Trey'Dez Green");
    expect(t).toContain("Open the Hub →");
  });

  it("reads a binary MHTML save like the one Chrome produces", () => {
    const file = mhtml(page, "binary");
    expect(isMhtml(file)).toBe(true);
    const { text, kind } = uploadedFileText(file);
    expect(kind).toBe("mhtml");
    const r = parseRankingsText(text);
    expect(r.layout).toBe("cards");
    expect(r.rows.map((x) => [x.rank, x.name, x.school, x.nflRank])).toEqual([
      [1, "Jeremiah Smith", "Ohio State", 1],
      [2, "Trey'Dez Green", "LSU", 20],
      [3, "Darian Mensah", "Miami (FL)", 7],
    ]);
  });

  it("decodes quoted-printable MHTML, including UTF-8 characters", () => {
    const file = mhtml(qp(page.replace("Jeremiah Smith", "José Núñez")), "quoted-printable");
    expect(htmlFromMhtml(file)).toContain("José Núñez");
    expect(parseRankingsText(uploadedFileText(file).text).rows[0]).toMatchObject({ name: "José Núñez", nflRank: 1 });
  });

  it("leaves plain text and CSV untouched", () => {
    const csv = "Player,Pos,School\nJeremiah Smith,WR,Ohio State";
    expect(uploadedFileText(csv)).toEqual({ text: csv, kind: "text" });
  });
});
