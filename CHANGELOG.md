# Changelog

## 2.0.0 (November 2026): real data, fair game loop, full rewrite of the core

### Security fixes
- Any signed-in user could change any other user's profile or password (account takeover). Now limited to
  yourself or an admin.
- Registration and `/auth/me` returned the bcrypt password hash; email and phone of every user were public.
- Private leagues and their join codes were readable by anyone who guessed an ID.
- The JWT secret silently fell back to a hard-coded default, allowing forged tokens; production now refuses to
  start without real secrets.
- The team budget was only checked in the browser; the server now validates roster, prices, captain and lock time.
- Login and register are rate limited; login timing no longer reveals which emails exist; mass-assignment on race
  updates removed.

### Bug fixes
- The Results page showed hard-coded mock data.
- Sessions broke after an hour (the refresh token was never used).
- Public leagues couldn't be joined and "Create League" linked to itself.
- League leaderboard ranks showed `undefined`; members with 0 points were missing.
- Teams could still be edited during a running race; races could get stuck "ONGOING" forever; the fastest lap
  changed randomly every lap.
- The admin results editor was empty for races without results.
- The auto-lock cron could crash the server on a database error; the server ignored `PORT`.
- Driver sorting "by points" did nothing (prices are derived from points); Prisma nested dates rendered as
  "Invalid Date".

### Features
- Real 2026 season from Jolpica-F1 / OpenF1 / Wikipedia: drivers, teams (with principals and logos), calendar,
  standings, race/qualifying/sprint results, and price history.
- Teams lock at the first scoring session; carry-over of your previous team; ×2 captain; prediction bonuses;
  sprint and qualifying points.
- Official results imported automatically and pushed instantly to open pages over SSE.
- Lap-by-lap replays of every finished race from real timing data, with live league scoring.
- Web Push lock reminders; league standings chart; driver pages; profile with full race history; Races hub;
  How-to-play page.
- Admin: real-data sync, test races + simulator, results corrections, principal/logo editing.

### Design
- Modern redesign: self-hosted Titillium Web / Inter / JetBrains Mono, glass-style cards, F1-livery page headers,
  grouped sidebar navigation with a user card, a next-race hero with a live lock countdown, and split-screen
  sign-in pages.

### Engineering
- Pure, unit-tested scoring module; integration tests against real Postgres; ESLint on both projects.
- Prisma migrations (baseline + feature migration) instead of `db push`.
- GitHub Actions CI; Jenkins pipeline parameterised for any server; Docker images and Compose stack;
  `deploy/deploy.sh`.
- Express app separated from server start-up; central error handling; shared `HttpError`; rate-limited API clients.
- Removed ~55 unused frontend packages and the unused Figma/shadcn template code (CSS bundle 106 KB → 42 KB);
  retired code kept in `archive/`.
- Full documentation in `docs/`, including a detailed DevOps guide (Jenkins, SonarQube, GitHub webhooks) and a
  planned DevSecOps / Kubernetes / GitOps / monitoring platform with its files in `devops/`.
- Jenkins pipeline v2: webhook trigger in code, lint + tests + coverage, SonarQube coverage, image builds,
  parameterised deploy; idempotent `devops/jenkins-setup.sh`.
