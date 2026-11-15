import prisma from '../../config/db.js'
import { parseId } from '../../utils/http.js'
import { startRaceRun, stopRaceRun, activeSimulations } from './simulation.services.js'

export const startSimulation = async (req, res) => {
    const raceId = parseId(req.params.raceId, 'Race ID')
    await startRaceRun(raceId)
    res.status(202).json({ message: 'Simulation started' })
}

export const stopSimulationController = async (req, res) => {
    const raceId = parseId(req.params.raceId, 'Race ID')
    const result = await stopRaceRun(raceId)
    if (result.stopped) return res.json({ message: 'Race run stopped' })
    res.status(404).json({ error: 'Nothing running for this race' })
}

export const getSimulationStatus = async (req, res) => {
    const raceId = parseId(req.params.raceId, 'Race ID')
    const race = await prisma.race.findUnique({ where: { id: raceId } })
    if (!race) return res.status(404).json({ error: 'Race not found' })

    const run = activeSimulations.get(raceId)
    res.json({
        raceId,
        status: race.status,
        running: Boolean(run),
        mode: run?.mode ?? null,
        lap: run?.lap ?? null,
        totalLaps: run?.totalLaps ?? null,
        testRace: race.round == null
    })
}
