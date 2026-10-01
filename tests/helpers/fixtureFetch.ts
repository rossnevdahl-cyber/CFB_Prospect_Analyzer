import path from "node:path";
import { fixtureFetch as load } from "@/lib/fixtureFetch";

export { fixtureKey } from "@/lib/fixtureFetch";

export function fixtureFetch(file: string) {
  return load(path.join(__dirname, "..", "fixtures", file));
}
