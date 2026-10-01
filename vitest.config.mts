import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname), "server-only": path.resolve(import.meta.dirname, "tests/helpers/empty.ts") } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
