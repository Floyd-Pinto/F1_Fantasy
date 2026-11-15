# Archive

Code and files removed from the live codebase during the November 2026 refactor, kept here for
reference instead of being deleted. Nothing in this folder is built, tested, linted or deployed.

| Path | Why it was retired |
| --- | --- |
| `Frontend/src/app/components/ui/` | 48 shadcn/ui components from the original Figma export — none were used by the app |
| `Frontend/src/app/components/figma/` | Figma-export image helper, unused |
| `Frontend/src/app/mockData.ts` | Hard-coded fake race data the old Results page displayed; replaced by real results |
| `Frontend/src/styles/theme.css`, `fonts.css`, `tailwind.css` | Template design tokens (unused) and an empty font file; replaced by a small `styles/index.css` |
| `Frontend/postcss.config.mjs` | Empty — Tailwind v4's Vite plugin needs no PostCSS config |
| `Frontend/package.original.json` | Original dependency list (~60 packages; 4 are actually used now) |
| `Backend/src/simulation/simulation.services.js` | Dead duplicate of the simulation service (never imported) |
| `Backend/src/api/simulation/simulation.services.original.js` | Original simulator (fixed-ID skill table, random fastest lap each tick) — replaced by `src/live/` |
| `Backend/scripts/check_points.js` | One-off debug script with hard-coded IDs |
| `Backend/tsconfig.json`, `Backend/prisma.config.ts` | Backend is plain ESM JavaScript; config moved to `prisma.config.js` |
| `Backend/src/api/ENDPOINTS.md` (+ `.session.md`) | Superseded by `docs/API.md` |
| `devops-v1/` | The original May 2026 Jenkinsfile, setup script and SonarQube config (pipeline v1, see docs/DEVOPS.md) |
| `IMPLEMENTATION_STATUS.md` | Original to-do list; every item is now implemented |

Not archived: the generated Prisma client (`Backend/prisma/generated`, build output recreated by
`npm install`) and a Windows shortcut file (`src - Shortcut.lnk`) with no content of value.
