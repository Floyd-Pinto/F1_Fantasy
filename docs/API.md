# API reference

Base URL: `http://localhost:4000` in development. JSON in, JSON out. Errors are always `{ "error": "message" }`
with a 4xx/5xx status.

**Auth:** send `Authorization: Bearer <accessToken>`. Access tokens last 1 hour; exchange the refresh token
(7 days) at `POST /auth/refresh`. The frontend does this automatically on a 401.

Legend: 🔓 public · 🔒 signed in · 🛡 admin

## Meta
| Method | Path | | Description |
|---|---|---|---|
| GET | `/health` | 🔓 | Liveness + database check → `{ status: "ok" }` (503 if the DB is down) |
| GET | `/config` | 🔓 | Game rules: `{ teamBudget, driversPerTeam }` |

## Auth — `/auth`
| Method | Path | | Description |
|---|---|---|---|
| POST | `/auth/register` | 🔓 | `{ username, email, password, phone_no }` → user (never includes the hash). Rate limited |
| POST | `/auth/login` | 🔓 | `{ email, password }` → `{ user, accessToken, refreshToken }`. Rate limited, email case-insensitive |
| POST | `/auth/refresh` | 🔓 | `{ refreshToken }` → `{ accessToken, user }` |
| GET | `/auth/me` | 🔒 | Current user |
| POST | `/auth/logout` | 🔓 | Stateless — the client discards its tokens |

## Users — `/users`
| Method | Path | | Description |
|---|---|---|---|
| GET | `/users/me/history` | 🔒 | Profile data: stats, upcoming teams, every past team with per-driver points breakdown and league rank |
| GET | `/users/:id` | 🔒 | Profile. Email/phone only for yourself or an admin |
| PUT | `/users/:id` | 🔒 | Update `username`, `email`, `phone_no`, `password` — yourself or admin only |
| GET | `/users` | 🛡 | All users |
| DELETE | `/users/:id` | 🛡 | Delete a user and their teams/points |

## Leagues — `/leagues` 🔒
| Method | Path | Description |
|---|---|---|
| GET | `/leagues` | My leagues |
| GET | `/leagues/public` | Public leagues (with join codes, `is_member`) |
| POST | `/leagues/create` | `{ name, league_type: "PUBLIC" \| "PRIVATE" }` → league with a 6-character code |
| POST | `/leagues/join` | `{ code }` (case-insensitive). 409 if already a member |
| GET | `/leagues/:id` | Details + members. Private leagues return 404 to non-members |
| POST | `/leagues/:id/leave` | Leave (owners delete instead) |
| DELETE | `/leagues/:id` | Owner or admin |

## Teams — `/teams` 🔒
| Method | Path | Description |
|---|---|---|
| POST | `/teams/build` | Create/replace my team for a race in a league (body below). Validated server-side |
| GET | `/teams/:raceId?leagueId=` | My team + its points/breakdown for that race |
| GET | `/teams/previous/:raceId?leagueId=` | My most recent earlier team in that league (used to prefill) |
| POST | `/teams/lock` | `{ raceId, leagueId }` lock early (teams also lock automatically) |
| PATCH | `/teams/:raceId/predictions` | `{ leagueId, driverId, predictedPosition }` change one prediction |
| POST | `/teams/unlock` | 🛡 `{ teamId }` |
| POST | `/teams/auto-lock/:raceId` | 🛡 Lock every team for a race now |

`POST /teams/build` body:
```json
{
  "raceId": 21, "leagueId": 3, "constructorId": 4, "captainId": 25,
  "predictions": [{ "driverId": 25, "predictedPosition": 1 }, { "driverId": 8, "predictedPosition": null }, "…5 total"]
}
```
`driverIds: [..5]` is accepted instead of `predictions` (no predictions). Rejected with 400 when: not exactly 5
distinct drivers, a driver/constructor is missing or inactive, the cost exceeds the budget, the captain isn't one
of the five, two predictions share a position, or the race is past its lock time. 403 if not a league member.

## Races — `/races`
| Method | Path | | Description |
|---|---|---|---|
| GET | `/races?season=` | 🔓 | Calendar with computed `status` (`SCHEDULED`, `ONGOING`, `RESULTS_PENDING`, `COMPLETED`), `lockAt`, `team_locked`, `replay_available`, `live` |
| GET | `/races/:id` | 🔓 | One race |
| GET | `/races/:id/live` | 🔓 | **Server-Sent Events** stream (`event: update`, JSON snapshot). Fires when official results are published, and every lap of a running test simulation |
| GET | `/races/:id/replay?leagueId=` | 🔒 | Lap-by-lap replay of a finished real race: drivers, frames, pre-race (qualifying/sprint) points, and — with `leagueId` — every team in that league for live scoring |
| POST | `/races` | 🛡 | Create a race. Races without a `round` are **test races** (the only ones the simulator may run) |
| PUT | `/races/:id` | 🛡 | Update (whitelisted fields). Setting `status: COMPLETED` locks teams and scores |
| DELETE | `/races/:id` | 🛡 | Delete with its teams/points |

## Results — `/results`
| Method | Path | | Description |
|---|---|---|---|
| GET | `/results/:raceId` | 🔓 | Classification with qualifying/sprint positions and each driver's fantasy points split |
| POST | `/results` | 🛡 | `{ raceId, results: [{ driverId, finish_pos, dnf, fastest_lap, quali_pos?, sprint_pos?, sprint_dnf? }] }` — saves, locks teams, scores, marks COMPLETED |
| PUT | `/results/:raceId` | 🛡 | Same, for corrections. Omitted qualifying/sprint fields keep their stored values |
| POST | `/results/calculate/:raceId` | 🛡 | Re-score a race |

## Leaderboards — `/leaderboard` 🔒
| Method | Path | Description |
|---|---|---|
| GET | `/leaderboard/global` | Global ranking (a player's best entry per race counts once) + current race leaders + my rank |
| GET | `/leaderboard/:leagueId` | Season standings — every member, tie-aware ranks |
| GET | `/leaderboard/:leagueId/history` | Points per race and running totals per member (league chart) |
| GET | `/leaderboard/:leagueId/race/:raceId` | One race's standings with breakdowns |

## Drivers & constructors
| Method | Path | | Description |
|---|---|---|---|
| GET | `/drivers?active=true` | 🔓 | Drivers with their team, ordered by championship position |
| GET | `/drivers/:id` | 🔓 | Driver page: profile, season results with fantasy points split, price history, stats |
| GET | `/constructors?active=true` | 🔓 | Teams with principal, logo, colour, points, price and current drivers |
| GET | `/constructors/:id` | 🔓 | One team |
| POST · PUT · DELETE | `/drivers[/:id]`, `/constructors[/:id]` | 🛡 | Manage. Constructors accept `teamPrincipal`, `logoUrl`, `color`. Deleting something used by teams → 409 (mark inactive instead) |

## Admin — `/admin` 🛡
| Method | Path | Description |
|---|---|---|
| GET | `/admin/users` | Users with roles |
| POST | `/admin/promote/:userId` · `/admin/demote/:userId` | Change role (you can't demote yourself) |
| POST | `/admin/sync` | `{ season?, force? }` pull real data now (teams, drivers, prices, calendar, results, images) |
| POST | `/admin/boot/:userId` | 🔓 One-time first-admin bootstrap; `{ token }` or `x-admin-boot` header must equal `ADMIN_BOOT_TOKEN` |

## Test-race simulator — `/simulation` 🛡
| Method | Path | Description |
|---|---|---|
| POST | `/simulation/start/:raceId` | Start a lap-by-lap simulation (test races only — 400 for real Grands Prix) |
| POST | `/simulation/stop/:raceId` | Abort and discard partial results |
| GET | `/simulation/:raceId/status` | `{ running, lap, totalLaps, testRace }` |

## Push reminders — `/push`
| Method | Path | | Description |
|---|---|---|---|
| GET | `/push/public-key` | 🔓 | VAPID public key for `PushManager.subscribe` |
| POST | `/push/subscribe` | 🔒 | `{ subscription }` (the browser's `PushSubscription.toJSON()`) |
| POST | `/push/unsubscribe` | 🔒 | `{ endpoint }` |
| POST | `/push/test` | 🔒 | Send a test notification to my devices |
