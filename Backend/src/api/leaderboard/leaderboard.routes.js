import express from 'express'
import {
    getLeagueLeaderboard,
    getRaceLeaderboard,
    getGlobalLeaderboard,
    getLeagueHistory
} from './leaderboard.controller.js'

import { protect } from '../middleware/auth.middleware.js'

const router = express.Router()

router.use(protect)

// global leaderboard (place before dynamic :leagueId route)
router.get('/global', getGlobalLeaderboard)

// season standings
router.get('/:leagueId', getLeagueLeaderboard)

// points per race / running totals (league chart)
router.get('/:leagueId/history', getLeagueHistory)

// per race breakdown
router.get('/:leagueId/race/:raceId', getRaceLeaderboard)

export default router