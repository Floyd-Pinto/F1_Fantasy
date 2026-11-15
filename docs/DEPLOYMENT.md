# Deployment

## Docker Compose (any server)
```bash
cp Backend/.env.example .env        # at least JWT_SECRET, JWT_REFRESH_SECRET; optionally SEED_ADMIN_*
docker compose up -d --build        # http://localhost:8080 (frontend), :4000 (API)
```
The backend container applies migrations and syncs real F1 data on start. Postgres data lives in the `db-data`
volume. For a real domain, put a reverse proxy with HTTPS in front (required for push notifications), set
`CORS_ORIGIN` to the site's origin and build the frontend with `VITE_API_BASE` pointing at the public API URL.

## Jenkins → your server
Full setup (Jenkins, SonarQube, GitHub webhook, credentials, troubleshooting): [DEVOPS.md](DEVOPS.md).

`Jenkinsfile` runs lint, tests (against a throwaway Postgres container), typecheck and build, optional
SonarQube, then deploys over SSH by running `deploy/deploy.sh` on the server (git pull + `docker compose up
-d --build` + health check).

One-time setup:
1. **Server:** install Docker, `git clone` this repo to `~/F1_Fantasy`, create `~/F1_Fantasy/.env` (see above).
2. **Jenkins:** add an SSH key credential with id `deploy-ssh-key`; create a Pipeline job from this repo.
3. Run with parameters: `DEPLOY_HOST` (server IP/host), `DEPLOY_USER` (default `ubuntu`), `APP_DIR`.
   Leave `DEPLOY_HOST` empty to run the checks without deploying. Tick `RUN_SONAR` if a SonarQube server named
   `SonarQube` is configured (`sonar-project.properties` is included).

## Free hosting (Render + Neon)
`render.yaml` is a Render Blueprint: the API as a free web service and the frontend as a free static site.
Create a free [Neon](https://neon.tech) Postgres database and paste its URL as `DATABASE_URL`. Note that free web
services sleep when idle, so scheduled jobs only run while the service is awake.

## Production checklist
- `NODE_ENV=production` with real `JWT_SECRET` / `JWT_REFRESH_SECRET` (the server refuses to start without them).
- `CORS_ORIGIN` set to the frontend origin.
- HTTPS (needed for service workers / push outside localhost).
- Optionally pin `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in env; otherwise they're generated once and stored in
  the database.
