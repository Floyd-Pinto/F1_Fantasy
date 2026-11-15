import express from 'express'
import cors from 'cors'

import authRoutes from './api/auth/auth.routes.js'
import userRoutes from './api/users/users.routes.js'
import leagueRoutes from './api/leagues/leagues.routes.js'
import teamRoutes from './api/teams/teams.routes.js'
import raceRoutes from './api/races/races.routes.js'
import resultRoutes from './api/results/results.routes.js'
import leaderboardRoutes from './api/leaderboard/leaderboard.routes.js'
import driverRoutes from './api/drivers/drivers.routes.js'
import constructorRoutes from './api/constructors/constructors.routes.js'
import adminRoutes from './api/admin/admin.routes.js'
import simulationRoutes from './api/simulation/simulation.routes.js'
import pushRoutes from './api/push/push.routes.js'
import { TEAM_BUDGET, DRIVERS_PER_TEAM } from './config/game.js'
import prisma from './config/db.js'

// Express app without side effects (no listening, no cron) so tests can mount it directly.
export const createApp = () => {
    const app = express()

    // Behind a hosting proxy (Render/Railway/etc.) so rate limiting sees real client IPs.
    app.set('trust proxy', 1)

    // CORS_ORIGIN is a comma-separated allowlist, e.g. "https://f1.example.com,http://localhost:5173".
    // When unset, every origin is allowed (convenient for local dev).
    const allowedOrigins = (process.env.CORS_ORIGIN || '')
        .split(',')
        .map(o => o.trim().replace(/\/$/, ''))
        .filter(Boolean)
        // Hosts may hand us a bare hostname (e.g. Render's `host` property); assume https.
        .map(o => (/^https?:\/\//.test(o) ? o : `https://${o}`))

    app.use(cors({
        origin: allowedOrigins.length ? allowedOrigins : true
    }))
    app.use(express.json({ limit: '100kb' }))

    app.get('/health', async (req, res) => {
        try {
            await prisma.$queryRaw`SELECT 1`
            res.json({ status: 'ok' })
        } catch {
            res.status(503).json({ status: 'db_unavailable' })
        }
    })

    app.get('/config', (req, res) => {
        res.json({ teamBudget: TEAM_BUDGET, driversPerTeam: DRIVERS_PER_TEAM })
    })

    app.use('/auth', authRoutes)
    app.use('/users', userRoutes)
    app.use('/leagues', leagueRoutes)
    app.use('/teams', teamRoutes)
    app.use('/races', raceRoutes)
    app.use('/results', resultRoutes)
    app.use('/leaderboard', leaderboardRoutes)
    app.use('/drivers', driverRoutes)
    app.use('/constructors', constructorRoutes)
    app.use('/admin', adminRoutes)
    app.use('/simulation', simulationRoutes)
    app.use('/push', pushRoutes)

    app.use((req, res) => {
        res.status(404).json({ error: 'Not found' })
    })

    // Central error handler: validation errors carry a status; anything else is a 500.
    // Express 5 forwards rejected promises from async handlers here automatically.
    app.use((err, req, res, next) => {
        if (err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Malformed JSON body' })
        }
        const status = err.status && err.status < 500 ? err.status : 500
        if (status === 500) console.error(err)
        res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message })
    })

    return app
}
