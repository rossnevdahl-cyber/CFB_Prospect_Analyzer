@AGENTS.md

## Project notes

- Spec-driven app: see README.md for architecture and the phase status.
- `pnpm lint && pnpm typecheck && pnpm test` before pushing. Tests use fixtures only — never call live APIs.
- Every data source goes through an adapter in `lib/adapters/` and the cache in `lib/cache.ts`.
- The report object (`lib/report/types.ts`) feeds both the page and the markdown export; change both together.
