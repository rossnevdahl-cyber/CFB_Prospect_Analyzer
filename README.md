# CFB Prospect Report

Enter a current college QB, RB, WR or TE by name, college and position and get a full dynasty
prospect report: season stats, advanced metrics, market share and breakout age, athletic testing,
rankings, team context, recruiting, a configurable composite grade with tier and confidence,
historical comps, film links, your own notes, and a big board per draft class.

Defaults: full PPR, superflex, 5-pt passing TDs (`config/grading.yaml`).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Postgres (Neon) · Drizzle ORM · Zod ·
`cfbd` client · Vitest · pnpm. Deployed on Vercel; bulk data jobs run in GitHub Actions.

## Pages

| Route | What it does |
| --- | --- |
| `/` | Search form: name (autocomplete from cached rosters), college (FBS dropdown), position. Exact match → report; close matches → pick list. |
| `/player/[cfbdId]` | The report, 14 sections in spec order. Copy markdown, Download .md, Refresh data (bypasses every cache), Add to board. |
| `/boards/[classYear]` | Big board: All/QB/RB/WR/TE tabs, drag-and-drop, ↑/↓ and "move to rank #", custom tiers as colored dividers, snapshots by date, notes search, Markdown/CSV export. |
| `/imports` | CSV uploads for PFF College, NFL big boards and dynasty rookie ADP. |
| `/api/report?id=…&format=md` | Report as JSON or Markdown (`&refresh=1` to bypass cache). |

Every page and API route sits behind `APP_PASSWORD` (`proxy.ts`, Next 16's renamed middleware).

## Setup (Phase 0)

1. **Neon:** add Neon Postgres from the Vercel Marketplace; copy the *pooled* connection string.
2. **Secrets** — set in Vercel (Production + Preview) and in GitHub → Settings → Secrets → Actions:
   `DATABASE_URL`, `CFBD_API_KEY`, `YOUTUBE_API_KEY`, `APP_PASSWORD`.
3. **Schema:** `DATABASE_URL=… pnpm db:migrate` (the GitHub jobs also migrate before running).
4. **Rosters:** run the `sync-rosters` workflow once with *backfill* checked (last 6 seasons), then it runs nightly in season and weekly otherwise.
5. **History:** run `update-history` (≈ 300 CFBD calls the first time; past seasons are cached forever). It writes `docs/data-coverage.md` — coverage depth and the CFBD ↔ nflverse ID match rate.
6. **Backtest:** run `backtest` to write `docs/backtest.md`.

### Local development

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm db:migrate
pnpm sync:rosters --backfill
pnpm dev
```

No API key? Set `CFBD_FIXTURE_FILE=tests/fixtures/cfbd/wr-transfer.json` and `CFBD_FIXTURE_SEASON=2025`
to serve recorded responses (development only), and insert roster rows for CFBD id `4870001`.

## How it works

```
resolve name → CFBD id (roster_players)   lib/search.ts, lib/names.ts
fetch via adapters, Postgres cache first   lib/adapters/*, lib/cache.ts (current season 24 h, past seasons never expire)
normalize into Zod types                   lib/normalize.ts, lib/types.ts
derive metrics                             lib/metrics.ts, lib/athletic.ts, lib/context.ts
grade + comps against history              lib/grading.ts, lib/comps.ts
render page + markdown from one object     lib/report/build.ts, components/report/*, lib/markdown.ts
```

- **Dominator** = mean(player rec yds ÷ team rec yds, player rec TD ÷ team rec TD); RBs use scrimmage.
- **Breakout age** = age on Sept. 1 of the first season the dominator meets the threshold (WR 20%, TE 15%, RB 15%).
- **ANY/A** = (yds + 20·TD − 45·INT − sack yds) ÷ (att + sacks). QB sacks are estimated from team sacks allowed × share of pass attempts (flagged in the report).
- **Athletic score** = position-specific percentile of each drill, size-adjusted (residual against weight), averaged to 0–10; needs ≥ 2 drills.
- **Grade** = weighted mean of component percentiles vs drafted players at the position. Missing components hand their weight to the rest; *confidence* = share of weight backed by data. Features with fewer than `min_history_sample` historical values (e.g. YPRR until PFF history exists) are shown but not graded.
- **Comps** = weighted Euclidean distance on within-position z-scores (grade weights + height/weight), similarity = exp(−d²/2), only players whose full college career is in CFBD.
- **Fantasy outcome** = NFL years 1–3 PPG under `scoring` in the config.

Edit `config/grading.yaml` on GitHub → Vercel redeploys → new weights, thresholds and tier cutoffs, no code change.

## Data sources

| Source | Adapter | Notes |
| --- | --- | --- |
| CollegeFootballData | `lib/adapters/cfbd.ts` | Rosters, box scores, game box scores (games played), PPA, team stats, advanced stats, SP+, games (SOS), recruiting, draft picks. |
| nflverse | `lib/adapters/nflverse.ts` | Draft picks (gsis/pfr ids), combine, birthdates, NFL season stats. Joined to CFBD draft picks by draft year + overall pick. |
| PFF College | `lib/adapters/pffCsv.ts` | Manual CSV export only — no scraping. |
| Big boards / ADP | `rankingsCsv.ts`, `adpCsv.ts` | CSV upload in v1. |
| YouTube Data API v3 | `lib/adapters/youtube.ts` | 2 searches (200 units) + 1 `videos.list` per uncached report ≈ 49 reports/day on the free quota; cached 7 days per player. Pin/hide/paste overrides persist across refreshes. |
| Birthdates | `data/overrides/birthdates.csv` | `cfbd_id,name,birthdate,source` for current players; nflverse for drafted ones. |

**CFBD call budget.** An uncached report costs roughly 3 calls per college season (stats, game box
scores, PPA) plus 4 season-wide calls per year (shared across all players) and 1–3 recruiting calls.
The free tier's monthly limit goes quickly; a Patreon tier is worth it for regular use.

## Tests

`pnpm test` runs against recorded fixtures in `tests/fixtures/` — never the live API. The CFBD file
`cfbd/wr-transfer.json` is shaped like the real API but was built by hand (the dev sandbox could not
reach CFBD); replace it with real recordings via `pnpm record:fixtures --file cfbd/wr-transfer.json`
once a key is configured. The nflverse excerpts are real release rows.

Covered: five hand-calculated players (dominator, breakout age, ANY/A, shares), grading and config
edits, comps, athletic score, name resolution, CSV parsing, YouTube filtering/ranking/overrides,
board reordering (40-player randomized position-view consistency), fantasy PPG, backtest, and an
end-to-end report build including the fully cached path and markdown section order.

## Status against the build phases

| Phase | State |
| --- | --- |
| 0 Setup and spike | Code ready; needs Vercel/Neon/secrets. `docs/data-coverage.md` is produced by the first `update-history` run. |
| 1 Core report | Done. Cached rebuild ≈ 20 ms locally; uncached depends on CFBD latency (calls run in parallel). |
| 2 History and metrics | Done (`update-history`, combine, dominator, breakout, athletic score). |
| 3 Grade and comps | Done, config-driven; `backtest` workflow. |
| 4 Notes and boards | Done. |
| 5 Imports | Done. |
| 6 Video links | Done; needs `YOUTUBE_API_KEY` to verify the 8-of-10 acceptance check on live data. |

## Open questions (from the spec)

- Which dynasty ADP source to standardize on, and does it offer superflex rookie ADP? (ADP import stores the format per row.)
- PFF tier and export format — the importer accepts any PFF table export and maps known columns.
- Should comps exclude players drafted in the last 3 years? (Backtest excludes the last 2 classes by default; comps currently include them.)
- Birthdate source for current players beyond the manual override file.
