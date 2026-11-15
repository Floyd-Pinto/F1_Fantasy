import express from 'express'
import { startSimulation, stopSimulationController, getSimulationStatus } from './simulation.controller.js'
import { protect } from '../middleware/auth.middleware.js'
import { isAdmin } from '../middleware/admin.middleware.js'

const router = express.Router()

router.use(protect, isAdmin)
router.post('/start/:raceId', startSimulation)
router.post('/stop/:raceId', stopSimulationController)
router.get('/:raceId/status', getSimulationStatus)

export default router
