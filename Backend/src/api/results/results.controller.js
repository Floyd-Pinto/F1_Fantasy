import prisma from '../../config/db.js'
import { parseId, httpError } from '../../utils/http.js'
import { calculateRacePoints, saveRaceResults } from './results.service.js'
import { weekendPoints } from '../../scoring/scoring.js'
import { activeSimulations } from '../../live/raceRunner.js'

const guardNotSimulating = (raceId) => {
    if (activeSimulations.has(raceId)) {
        throw httpError(409, 'Stop the running simulation before editing results')
    }
}

export const submitResults = async (req, res) => {
    const raceId = parseId(req.body?.raceId, 'Race ID')
    guardNotSimulating(raceId)
    await saveRaceResults(raceId, req.body?.results)
    res.json({ message: 'Results saved and scoring triggered' })
}

export const updateResults = async (req, res) => {
    const raceId = parseId(req.params.raceId, 'Race ID')
    guardNotSimulating(raceId)
    await saveRaceResults(raceId, req.body?.results)
    res.json({ message: 'Results updated and re-scored' })
}

const formatResults = (results) =>
    results.map(r => {
        const pts = weekendPoints(r)
        return {
            driver_id: r.driverId,
            driver_name: r.driver.name,
            driver_code: r.driver.code,
            driver_number: r.driver.number,
            headshot_url: r.driver.headshotUrl,
            constructor_name: r.driver.constructor?.name || null,
            team_color: r.driver.constructor?.color || null,
            finish_pos: r.finishPosition,
            fastest_lap: r.fastestLap,
            dnf: r.dnf,
            quali_pos: r.qualiPosition,
            sprint_pos: r.sprintPosition,
            sprint_dnf: r.sprintDnf,
            points: pts.total,
            points_breakdown: { race: pts.race, sprint: pts.sprint, quali: pts.quali }
        }
    })

export const getRaceResults = async (req, res) => {
    const raceId = parseId(req.params.raceId, 'Race ID')

    const results = await prisma.raceResult.findMany({
        where: { raceId },
        include: { driver: { include: { constructor: { select: { name: true, color: true } } } } },
        orderBy: [{ dnf: 'asc' }, { finishPosition: { sort: 'asc', nulls: 'last' } }]
    })

    res.json(formatResults(results))
}

export const calculateResults = async (req, res) => {
    const raceId = parseId(req.params.raceId, 'Race ID')
    const scored = await calculateRacePoints(raceId)
    res.json({ message: 'Race points calculated successfully', raceId, teamsScored: scored })
}
