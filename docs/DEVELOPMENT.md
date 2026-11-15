# Development

## Prerequisites
Node 20+ (22 recommended) and PostgreSQL 16 (or Docker).

## Setup
```bash
# Database
docker run -d --name f1-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine
docker exec f1-pg createdb -U postgres f1fantasy
docker exec f1-pg createdb -U postgres f1_test     # for integration tests

# Backend
cd Backend
cp .env.example .env            # set DATABASE_URL, JWT secrets, SEED_ADMIN_* for an admin account
npm install                     # also generates the Prisma client
npm run db:setup                # apply migrations + load the real current season (~30 s)
npm run dev                     # http://localhost:4000 (nodemon)

# Frontend
cd ../Frontend
npm install
npm run dev                     # http://localhost:5173
```

## Scripts
| Backend | |
|---|---|
| `npm run dev` / `npm start` | Server with / without auto-reload |
| `npm test` | Unit + integration tests (integration needs `TEST_DATABASE_URL`) |
| `npm run test:db` | Apply migrations to the test database |
| `npm run lint` | ESLint |
| `npm run db:setup` | Migrate + seed real data (+ admin from `SEED_ADMIN_*`) |
| `npm run db:migrate` / `npm run migrate:dev` | Apply migrations / create a new one |
| `npm run seed` | Re-run the real-data sync |

| Frontend | |
|---|---|
| `npm run dev` / `build` / `preview` | Vite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (TypeScript + React hooks rules) |

## Tests
`Backend/test/scoring.test.js` unit-tests every scoring rule. `Backend/test/api.test.js` starts the real Express
app on a random port against a real Postgres database and covers auth, access control, leagues, team rules
(budget, captain, lock), carry-over, full scoring through results publication, the SSE push, the simulator guard
and push-subscription validation. The integration suite **wipes** its database and refuses to run unless the
database name contains `test`.

```bash
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/f1_test
npm run test:db && npm test
```

## CI
`.github/workflows/ci.yml` runs on every push/PR: backend lint → migrations against a Postgres service → tests;
frontend lint → typecheck → build.

## Trying the features locally
- **Admin:** set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before `db:setup`.
- **Replays:** Races → any past race → *Lap-by-lap replay*.
- **Live push:** Admin → *New test race* → *Simulate*, then open its live view.
- **Reminders:** Profile → Lock reminders → *Turn on* → *Send test* (works on `localhost`; elsewhere needs https).

## Conventions
- Backend: plain ESM JavaScript, 4-space indent; controllers throw `HttpError`/`badRequest` and let the central
  handler respond. Business rules (scoring) stay in pure modules.
- Frontend: TypeScript, one page component per route in `pages/`, shared UI in `components/`.
- Schema changes always go through a migration.
