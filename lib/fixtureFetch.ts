import fs from "node:fs";

/** Canonical fixture key: path plus sorted query string. recordFixtures writes the same keys. */
export function fixtureKey(url: URL): string {
  const q = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
  return `${url.pathname}?${q}`;
}

/**
 * A fetch that serves recorded CFBD responses from a JSON file and answers 404 for anything not
 * recorded. Used by tests, and by the app when CFBD_FIXTURE_FILE is set (offline development).
 */
export function fixtureFetch(file: string) {
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const requests: string[] = [];
  const fn = async (input: Request | string | URL): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const key = fixtureKey(url);
    requests.push(key);
    if (!(key in data)) return new Response(JSON.stringify({ message: `no fixture for ${key}` }), { status: 404, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(data[key]), { status: 200, headers: { "content-type": "application/json" } });
  };
  return Object.assign(fn, { requests });
}
