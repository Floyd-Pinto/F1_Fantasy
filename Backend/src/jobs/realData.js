import cron from 'node-cron'
import prisma from '../config/db.js'
import { syncSeason } from '../services/sync.service.js'
import { getReplayFrames } from '../services/replay.service.js'
import { sendLockReminders } from '../services/push.service.js'

// Official results usually appear within an hour or two of the flag; keep checking for a week.
const RESULTS_WATCH_START_MS = 90 * 60 * 1000
const RESULTS_WATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const pendingRaces = () => {
    const now = Date.now()
    return prisma.race.findMany({
        where: {
            round: { not: null },
            status: { not: 'COMPLETED' },
            raceStart: { lte: new Date(now - RESULTS_WATCH_START_MS), gte: new Date(now - RESULTS_WATCH_WINDOW_MS) }
        }
    })
}

// While a real race is waiting for its official classification, poll for it.
export const checkForNewResults = async () => {
    const pending = await pendingRaces()
    if (!pending.length) return
    const seasons = [...new Set(pending.map(r => r.season))]
    for (const season of seasons) {
        const { resultsImported } = await syncSeason(season)
        if (resultsImported) await warmReplays()
    }
}

// Pre-build replays for finished races so the first viewer doesn't wait (OpenF1 is rate limited).
export const warmReplays = async () => {
    const missing = await prisma.race.findMany({
        where: { status: 'COMPLETED', openf1SessionKey: { not: null }, replay: null },
        orderBy: { raceStart: 'desc' },
        take: 3
    })
    for (const race of missing) {
        try {
            await getReplayFrames(race.id)
            console.log(`[replay] cached ${race.name}`)
        } catch (err) {
            console.warn(`[replay] ${race.name}: ${err.message}`)
        }
    }
}

export const startReminderJob = () =>
    cron.schedule('*/5 * * * *', async () => {
        try {
            await sendLockReminders()
        } catch (err) {
            console.error('[push] reminders failed:', err.message)
        }
    })

export const startRealDataJobs = () => {
    if (process.env.REAL_DATA_SYNC === 'false') {
        console.log('[jobs] real data sync disabled')
        return
    }

    const guard = (name, fn) => async () => {
        try {
            await fn()
        } catch (err) {
            console.error(`[${name}] failed:`, err.message)
        }
    }

    // Full refresh: standings, prices, calendar changes, any missed results.
    cron.schedule(process.env.SYNC_CRON || '17 */6 * * *', guard('sync', () => syncSeason()))
    // Fast path right after a race: publish official results within ~10 minutes of release.
    cron.schedule('*/10 * * * *', guard('results-watch', checkForNewResults))
    // Slowly fill the replay cache for past races (3 per hour keeps OpenF1 usage tiny).
    cron.schedule('41 * * * *', guard('replay-cache', warmReplays))
}
