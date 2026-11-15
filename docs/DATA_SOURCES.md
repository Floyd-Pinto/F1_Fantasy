# Data sources

Everything is free and needs no API keys.

| Source | Used for | Limits we respect |
|---|---|---|
| [Jolpica-F1](https://github.com/jolpica/jolpica-f1) (Ergast successor) | Calendar and session times, drivers, constructors, standings (also per round, for price history), race / qualifying / sprint results | ~4 req/s burst, ~500 req/hour — client spaces requests 400 ms apart |
| [OpenF1](https://openf1.org) | Current grid (car numbers, team colours, headshots), race session keys, lap & position timing for replays | Free tier 3 req/s, 30 req/min — client spaces requests 2.1 s apart. Data is free from 30 min after a session ends; live in-session data is a paid tier and is **not used** |
| [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) | Team logos; portraits for drivers F1 has no headshot for | Light use (a few calls per sync) |

All clients go through `Backend/src/integrations/http.js` (rate limiting, 429 back-off, timeouts, a generic
User-Agent).

## What syncs when
| Job | Schedule | Work |
|---|---|---|
| Full sync | every 6 h (`SYNC_CRON`) | Teams, drivers, prices, calendar, any missing results, images, price history |
| Results watcher | every 10 min, only while a race awaits results | Imports the official classification as soon as it appears and pushes it to open pages |
| Replay cache | hourly, 3 races per run | Builds lap-by-lap replays for finished races from OpenF1 |
| Admin "Sync real F1 data" | on demand | Same as the full sync |

## Image handling
F1's media server answers a missing headshot with a ~700-byte grey silhouette rather than a 404. The sync
downloads each active driver's headshot once, treats anything under 2 KB as that placeholder, and swaps in the
lead image of the driver's Wikipedia article. Team logos are filled from Wikipedia on first sync and never
overwritten, so corrections made in Admin stick.

## Licensing notes
Wikipedia/Wikimedia images are used under their respective licences and credited in the UI; team logos are
trademarks of their teams. OpenF1 data is for non-commercial use. This is an unofficial fan project.

Team principals aren't available from any free API; they're seeded from `Backend/src/services/teamInfo.js` and
editable in Admin.
