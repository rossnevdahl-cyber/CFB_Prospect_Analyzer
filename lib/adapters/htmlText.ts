/**
 * Turns a saved web page (.mht/.mhtml or .html) into the same line-per-field text a copy-paste
 * produces, so a saved rankings page can be uploaded like pasted text. Runs in the browser before
 * upload (no Node APIs), which keeps multi-megabyte page saves off the server.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rarr: "→" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Quoted-printable (RFC 2045), as Chrome uses for some MHTML parts. Decodes UTF-8 byte runs. */
function decodeQuotedPrintable(s: string): string {
  const joined = s.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const c = joined[i];
    if (c === "=" && /^[0-9A-F]{2}$/i.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      // Characters outside ASCII are already decoded text; re-encode them as UTF-8 bytes.
      for (const b of new TextEncoder().encode(c)) bytes.push(b);
    }
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

export function isMhtml(text: string): boolean {
  return /^(From:|MIME-Version:|Content-Type:\s*multipart\/related)/im.test(text.slice(0, 2000)) && /multipart\/related/i.test(text.slice(0, 5000));
}

export function looksLikeHtml(text: string): boolean {
  return /<(!doctype html|html|body|div|table)[\s>]/i.test(text.slice(0, 5000));
}

/** The first text/html part of an MHTML archive, decoded. */
export function htmlFromMhtml(text: string): string | null {
  const boundary = text.match(/boundary="?([^"\r\n;]+)"?/i)?.[1];
  if (!boundary) return null;
  for (const part of text.split(`--${boundary}`)) {
    const split = part.search(/\r?\n\r?\n/);
    if (split < 0) continue;
    const headers = part.slice(0, split);
    if (!/content-type:\s*text\/html/i.test(headers)) continue;
    const body = part.slice(split).replace(/^\r?\n\r?\n/, "");
    return /content-transfer-encoding:\s*quoted-printable/i.test(headers) ? decodeQuotedPrintable(body) : body;
  }
  return null;
}

/** Visible text of an HTML document, one block of text per line. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|svg|noscript|template|head)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<[^>]+>/g, "\n"),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Text to parse for an uploaded file: saved pages are reduced to their visible text. */
export function uploadedFileText(text: string): { text: string; kind: "mhtml" | "html" | "text" } {
  if (isMhtml(text)) {
    const html = htmlFromMhtml(text);
    if (html) return { text: htmlToText(html), kind: "mhtml" };
  }
  if (looksLikeHtml(text)) return { text: htmlToText(text), kind: "html" };
  return { text, kind: "text" };
}
