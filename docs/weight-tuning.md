# Weight tuning

_Generated 2026-10-02. Weights searched on draft classes through 2018, checked on 2019–2024. Fixed: draft_capital._

| Position | Train n | Test n | Train ρ spec → tuned | Test ρ spec → tuned | Adopt |
| --- | ---: | ---: | ---: | ---: | :---: |
| QB | 153 | 68 | 0.572 → 0.596 | 0.508 → 0.524 | yes |
| RB | 302 | 122 | 0.589 → 0.595 | 0.526 → 0.548 | yes |
| WR | 417 | 197 | 0.550 → 0.551 | 0.509 → 0.485 | no |
| TE | 188 | 84 | 0.564 → 0.593 | 0.473 → 0.388 | no |

## Weights

```yaml
weights:
  QB: {production: 0.35, efficiency: 0.20, age_breakout: 0.05, athleticism: 0.05, draft_capital: 0.20, pedigree: 0.05, context: 0.10}
  RB: {production: 0.35, efficiency: 0.15, age_breakout: 0.05, athleticism: 0.10, draft_capital: 0.20, pedigree: 0.05, context: 0.10}
  WR: {production: 0.30, efficiency: 0.15, age_breakout: 0.20, athleticism: 0.10, draft_capital: 0.15, pedigree: 0.05, context: 0.05}
  TE: {production: 0.25, efficiency: 0.15, age_breakout: 0.15, athleticism: 0.20, draft_capital: 0.15, pedigree: 0.05, context: 0.05}
```

## Spec weights (for reference)

```yaml
  QB: {production: 0.20, efficiency: 0.30, age_breakout: 0.05, athleticism: 0.15, draft_capital: 0.20, pedigree: 0.05, context: 0.05}
  RB: {production: 0.25, efficiency: 0.20, age_breakout: 0.10, athleticism: 0.15, draft_capital: 0.20, pedigree: 0.05, context: 0.05}
  WR: {production: 0.30, efficiency: 0.15, age_breakout: 0.20, athleticism: 0.10, draft_capital: 0.15, pedigree: 0.05, context: 0.05}
  TE: {production: 0.25, efficiency: 0.15, age_breakout: 0.15, athleticism: 0.20, draft_capital: 0.15, pedigree: 0.05, context: 0.05}
```
