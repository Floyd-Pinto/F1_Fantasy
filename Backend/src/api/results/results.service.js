import prisma from '../../config/db.js'
import { weekendPoints, scoreTeam } from '../../scoring/scoring.js'
import { httpError } from '../../utils/http.js'

// A driver's weekend total (race + sprint + qualifying), shown next to results.
export const getDriverPoints = (result) => weekendPoints(result).total


// Idempotent: clears previous Points rows for the race and recreates them in one transaction,
// so leaderboards never observe a half-written state.
export const calculateRacePoints = async (raceId) => {
    const [results, teams] = await Promise.all([
        prisma.raceResult.findMany({ where: { raceId }, include: { driver: { select: { constructorId: true } } } }),
        prisma.team.findMany({ where: { raceId }, include: { predictions: true } })
    ])

    const resultsByDriver = new Map(results.map(r => [r.driverId, r]))
    const constructorOfDriver = new Map(results.map(r => [r.driverId, r.driver?.constructorId ?? null]))

    const pointsData = teams.map(team => {
        const { total, breakdown } = scoreTeam(team, resultsByDriver, constructorOfDriver)
        return { userId: team.userId, raceId: team.raceId, leagueId: team.leagueId, totalPts: total, breakdown }
    })

    await prisma.$transaction([
        prisma.points.deleteMany({ where: { raceId } }),
        ...(pointsData.length ? [prisma.points.createMany({ data: pointsData })] : [])
    ])

    return pointsData.length
}

const optionalPosition = (value, field) => {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    const n = Number(value)
    if (!Number.isInteger(n) || n < 1) throw httpError(400, `${field} must be a positive integer`)
    return n
}

/**
 * Replace a race's results, lock its teams, re-score and mark it COMPLETED.
 * Each row: { driverId, finish_pos, dnf, fastest_lap, quali_pos?, sprint_pos?, sprint_dnf? }.
 * Qualifying/sprint fields left undefined keep their stored values, so correcting the race order
 * in the admin editor never wipes Saturday's results.
 */
export const saveRaceResults = async (raceId, results) => {
    if (!Array.isArray(results) || results.length === 0) throw httpError(400, 'results must be a non-empty array')

    const race = await prisma.race.findUnique({ where: { id: raceId } })
    if (!race) throw httpError(404, 'Race not found')

    const existing = new Map((await prisma.raceResult.findMany({ where: { raceId } })).map(r => [r.driverId, r]))

    const rows = results.map(r => {
        const driverId = Number(r.driverId)
        if (!Number.isInteger(driverId) || driverId <= 0) throw httpError(400, 'Each result needs a valid driverId')
        const prev = existing.get(driverId)
        const quali = optionalPosition(r.quali_pos, 'quali_pos')
        const sprint = optionalPosition(r.sprint_pos, 'sprint_pos')
        return {
            raceId,
            driverId,
            finishPosition: optionalPosition(r.finish_pos, 'finish_pos') ?? null,
            fastestLap: Boolean(r.fastest_lap),
            dnf: Boolean(r.dnf),
            qualiPosition: quali !== undefined ? quali : prev?.qualiPosition ?? null,
            sprintPosition: sprint !== undefined ? sprint : prev?.sprintPosition ?? null,
            sprintDnf: r.sprint_dnf !== undefined ? Boolean(r.sprint_dnf) : prev?.sprintDnf ?? false
        }
    })

    if (new Set(rows.map(r => r.driverId)).size !== rows.length) throw httpError(400, 'Duplicate driver in results')
    if (rows.filter(r => r.fastestLap).length > 1) throw httpError(400, 'Only one driver can have the fastest lap')

    await prisma.$transaction([
        prisma.raceResult.deleteMany({ where: { raceId } }),
        prisma.raceResult.createMany({ data: rows }),
        prisma.team.updateMany({ where: { raceId }, data: { locked: true } }),
        prisma.race.update({ where: { id: raceId }, data: { status: 'COMPLETED', raceEnd: race.raceEnd || new Date() } })
    ])

    await calculateRacePoints(raceId)
}

export default { getDriverPoints, calculateRacePoints, saveRaceResults }
