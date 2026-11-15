# Scoring

Every rule lives in one pure module, `Backend/src/scoring/scoring.js`, covered by unit tests
(`Backend/test/scoring.test.js`). The frontend mirrors the constants in `Frontend/src/app/scoring.ts`.

## Team
- 5 drivers + 1 constructor, total price ≤ **$100M**.
- One driver can be **captain**.
- Optional **prediction** of each driver's race finishing position.
- Teams **lock** at the first scoring session of the weekend (qualifying, or the sprint on sprint weekends).
- No team at lock time → your **previous team in that league carries over** (drivers, constructor, captain;
  predictions are race-specific and don't carry). A carried team keeps its original picks even if prices have
  since moved above the budget.

## Points per driver
| Session | Points |
|---|---|
| Race | P1 25 · P2 18 · P3 15 · P4 12 · P5 10 · P6 8 · P7 6 · P8 4 · P9 2 · P10 1 · DNF 0 |
| Fastest lap | +5, only with a top-10 finish |
| Sprint | P1 8 · P2 7 · … · P8 1 · DNF 0 |
| Qualifying | P1 10 · P2 9 · … · P10 1 |

**Captain:** that driver's race + sprint + qualifying points ×2.
**Prediction:** exact finishing position +5, one place off +2, otherwise 0 (never doubled; no bonus for a DNF).
**Constructor:** the race + sprint + qualifying points of both of its drivers (no captain/prediction).

## Worked example (from the integration test)
Captain finishes P1 from pole, wins the sprint, predicted P1: `(25 + 8 + 10) × 2 + 5 = 91`.
Team-mate P2, sprint P2, qualified P2, predicted P3: `18 + 7 + 9 + 2 = 36`. Their constructor: `43 + 34 = 77`.

## Where it runs
- **Real races:** when official results are imported, `calculateRacePoints` scores every team for that race and
  replaces its `Points` rows in one transaction. The per-driver breakdown is stored as JSON for the profile page.
- **Replays:** the client re-applies the same rules lap by lap (qualifying/sprint banked from lap 0) so the league
  table builds up as the race unfolds. These numbers are provisional — stored points always come from results.
