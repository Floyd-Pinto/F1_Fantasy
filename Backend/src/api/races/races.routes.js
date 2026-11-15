import express from 'express'
import { getAllRaces, getRaceById, createRace, updateRace, deleteRace, loadRaceSnapshot, getRaceReplay } from './races.controller.js'
import { protect } from '../middleware/auth.middleware.js'
import { isAdmin } from '../middleware/admin.middleware.js'
import { streamRace } from '../../live/raceEvents.js'

const router = express.Router()

// Public
router.get('/', getAllRaces)
router.get('/:id', getRaceById)
// Push feed (Server-Sent Events): results/standings the moment they land, and lap-by-lap for test simulations.
router.get('/:id/live', streamRace(loadRaceSnapshot))
// Lap-by-lap replay of a finished real race (built once from OpenF1, then cached).
router.get('/:id/replay', protect, getRaceReplay)

// Admin
router.post('/', protect, isAdmin, createRace)
router.put('/:id', protect, isAdmin, updateRace)
router.delete('/:id', protect, isAdmin, deleteRace)

export default router
