# Backtest: grade vs NFL years 1–3 PPG

_Generated 2026-10-02. Weights from config/grading.yaml at this commit. Draft classes after 2024 excluded (incomplete NFL outcomes)._

| Position | Players graded | Pearson r | Spearman ρ | Draft-pick-only ρ |
| --- | ---: | ---: | ---: | ---: |
| QB | 221 | 0.566 | 0.552 | 0.641 |
| RB | 424 | 0.570 | 0.570 | 0.598 |
| WR | 614 | 0.504 | 0.541 | 0.573 |
| TE | 272 | 0.526 | 0.540 | 0.644 |

## Component correlations (Pearson r with PPG)

| Position | production | efficiency | age_breakout | athleticism | draft_capital | pedigree | context |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| QB | 0.384 | 0.300 | 0.232 | 0.296 | 0.639 | 0.091 | 0.066 |
| RB | 0.433 | 0.191 | 0.279 | 0.167 | 0.601 | 0.206 | 0.056 |
| WR | 0.320 | 0.069 | 0.355 | 0.172 | 0.566 | 0.229 | 0.013 |
| TE | 0.362 | -0.004 | 0.201 | 0.198 | 0.622 | 0.091 | 0.054 |

Percentiles are computed against the full historical table, including the player being graded.
