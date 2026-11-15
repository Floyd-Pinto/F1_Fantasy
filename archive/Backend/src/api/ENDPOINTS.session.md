# API Endpoints

Auth: `🔒` = signed in, `🛡` = admin.

**Meta**
- `GET /health`: liveness + DB check
- `GET /config`: game rules (budget, team size)

**Auth**
- `POST /auth/register`, `POST /auth/login` (rate limited)
- `POST /auth/refresh`: new access token from a refresh token
- `GET /auth/me` 🔒, `POST /auth/logout`

**Users** 🔒
- `GET /users/:id`: public profile (email/phone only for self or admin)
- `PUT /users/:id`: self or admin only
- `GET /users` 🛡, `DELETE /users/:id` 🛡

**Leagues** 🔒
- `GET /leagues`: my leagues
- `GET /leagues/public`: public leagues (with join codes)
- `POST /leagues/create` `{ name, league_type: PUBLIC|PRIVATE }`
- `POST /leagues/join` `{ code }`
- `GET /leagues/:id`: private leagues are visible to members only
- `POST /leagues/:id/leave`, `DELETE /leagues/:id` (owner or admin)

**Teams** 🔒
- `POST /teams/build` `{ raceId, leagueId, driverIds[5], constructorId }`: validates roster, active grid and budget
- `GET /teams/:raceId?leagueId=`: my team plus points for that race
- `PATCH /teams/:raceId/predictions`, `POST /teams/lock`
- `POST /teams/unlock` 🛡, `POST /teams/auto-lock/:raceId` 🛡

**Races**
- `GET /races[?season=]`, `GET /races/:id`
- `GET /races/:id/live`: **Server-Sent Events** stream of lap-by-lap snapshots (`event: update`)
- `POST /races` 🛡, `PUT /races/:id` 🛡, `DELETE /races/:id` 🛡

**Results**
- `GET /results/:raceId`
- `POST /results` 🛡, `PUT /results/:raceId` 🛡: save results, lock teams, re-score
- `POST /results/calculate/:raceId` 🛡

**Live race runs** 🛡
- `POST /simulation/start/:raceId` `{ mode: "simulated" | "replay" }`
- `POST /simulation/stop/:raceId`: abort and discard partial results
- `GET /simulation/:raceId/status`

**Leaderboards** 🔒
- `GET /leaderboard/global`
- `GET /leaderboard/:leagueId`: season standings (all members, ranked)
- `GET /leaderboard/:leagueId/race/:raceId`

**Drivers / Constructors**
- `GET /drivers[?active=true]`, `GET /drivers/:id`, `GET /constructors[?active=true]`, `GET /constructors/:id`
- `POST|PUT|DELETE` 🛡 (constructors accept `teamPrincipal`, `color`)

**Admin** 🛡
- `GET /admin/users`, `POST /admin/promote/:userId`, `POST /admin/demote/:userId`
- `POST /admin/sync` `{ season?, force? }`: sync real F1 data
- `POST /admin/boot/:userId`: one-time first-admin bootstrap (token in body or `x-admin-boot` header)
