import prisma from '../../config/db.js'
import { startRace, stopRace, activeSimulations } from '../../live/raceRunner.js'
import { createSimulatedFeed } from '../../live/feeds/simulated.js'
import { httpError } from '../../utils/http.js'

export { activeSimulations }


// Synthetic race for testing. Only allowed on admin-created test races (no championship round),
// so fake results can never land on a real Grand Prix.
export const startRaceRun = async (raceId) => {
    const race = await prisma.race.findUnique({ where: { id: raceId } })
    if (!race) throw httpError(404, 'Race not found')
    if (race.round != null) throw httpError(400, 'Simulations are only for test races — real races are scored from official results')
    if (activeSimulations.has(raceId)) throw httpError(409, 'This race is already running')
    if (race.status === 'COMPLETED') throw httpError(409, 'Race already completed')

    return startRace(raceId, await createSimulatedFeed())
}

export const stopRaceRun = (raceId) => stopRace(raceId)
