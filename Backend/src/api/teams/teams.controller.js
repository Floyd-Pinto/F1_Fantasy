import prisma from '../../config/db.js'
import { parseId, badRequest } from '../../utils/http.js'
import { TEAM_BUDGET, DRIVERS_PER_TEAM } from '../../config/game.js'

const TEAM_INCLUDE = {
    predictions: { include: { driver: true }, orderBy: { predictedPosition: 'asc' } },
    constructor: true
}

const normalizePredictedPosition = (value) => {
    if (value === undefined || value === null || value === '') return null
    const position = Number(value)
    if (!Number.isInteger(position) || position < 1 || position > 30) {
        throw badRequest('Predicted position must be between 1 and 30')
    }
    return position
}

const normalizeTeamPredictions = ({ driverIds, predictions }) => {
    const source = Array.isArray(predictions) && predictions.length > 0
        ? predictions
        : Array.isArray(driverIds)
            ? driverIds.map((driverId) => ({ driverId, predictedPosition: null })) // predictions are opt-in
            : null

    if (!source) throw badRequest('Driver predictions are required')

    const normalized = source.map((prediction) => {
        const isObject = typeof prediction === 'object' && prediction !== null
        const driverId = isObject ? prediction.driverId ?? prediction.id : prediction
        const rawPosition = isObject ? prediction.predictedPosition ?? prediction.position ?? null : null
        return {
            driverId: parseId(driverId, 'Driver ID'),
            predictedPosition: normalizePredictedPosition(rawPosition),
            predictedDNF: Boolean(isObject ? prediction.predictedDNF : false)
        }
    })

    if (normalized.length !== DRIVERS_PER_TEAM) throw badRequest(`Exactly ${DRIVERS_PER_TEAM} drivers required`)
    if (new Set(normalized.map(p => p.driverId)).size !== normalized.length) throw badRequest('Duplicate drivers not allowed')

    const positions = normalized.map(p => p.predictedPosition).filter(p => p !== null)
    if (new Set(positions).size !== positions.length) throw badRequest('Duplicate predicted positions not allowed')

    return normalized
}

const lockTimeOf = (race) => race.lockAt ?? race.raceStart

// A team can be edited only until the first scoring session (qualifying or sprint) begins.
const assertRaceOpen = (race) => {
    if (race.status !== 'SCHEDULED' || new Date() >= lockTimeOf(race)) {
        throw badRequest('Teams are locked — the race weekend has started')
    }
}

const formatTeam = (team) => ({
    id: team.id,
    locked: team.locked,
    driverIds: team.predictions.map(p => p.driverId),
    constructorId: team.constructorId,
    captainId: team.captainId,
    carriedOver: team.carriedOver,
    drivers: team.predictions.map(p => p.driver.name),
    predictions: team.predictions.map(p => ({
        driverId: p.driverId,
        driverName: p.driver.name,
        predictedPosition: p.predictedPosition,
        predictedDNF: p.predictedDNF
    })),
    constructor: team.constructor?.name ?? null,
    cost: Math.round((team.predictions.reduce((s, p) => s + p.driver.price, 0) + (team.constructor?.price || 0)) * 10) / 10
})

export const buildTeam = async (req, res) => {
    const { raceId, leagueId, driverIds, constructorId, predictions, captainId } = req.body || {}
    const userId = req.user.id
    const parsedRaceId = parseId(raceId, 'Race ID')
    const parsedLeagueId = parseId(leagueId, 'League ID')
    const parsedConstructorId = parseId(constructorId, 'Constructor ID')
    const teamPredictions = normalizeTeamPredictions({ driverIds, predictions })
    const parsedCaptainId = captainId == null || captainId === '' ? null : parseId(captainId, 'Captain ID')
    if (parsedCaptainId && !teamPredictions.some(p => p.driverId === parsedCaptainId)) {
        throw badRequest('Captain must be one of your five drivers')
    }

    const membership = await prisma.leagueMember.findUnique({
        where: { leagueId_userId: { leagueId: parsedLeagueId, userId } }
    })
    if (!membership) return res.status(403).json({ error: 'Not in league' })

    const race = await prisma.race.findUnique({ where: { id: parsedRaceId } })
    if (!race) return res.status(404).json({ error: 'Race not found' })
    assertRaceOpen(race)

    // Validate the roster against the database, not the client: existence, active status and budget.
    const [drivers, constructor] = await Promise.all([
        prisma.driver.findMany({ where: { id: { in: teamPredictions.map(p => p.driverId) } } }),
        prisma.constructor.findUnique({ where: { id: parsedConstructorId } })
    ])
    if (drivers.length !== teamPredictions.length) throw badRequest('One or more drivers do not exist')
    if (drivers.some(d => !d.active)) throw badRequest('One or more drivers are not on the current grid')
    if (!constructor || !constructor.active) throw badRequest('Constructor does not exist or is inactive')

    const cost = drivers.reduce((sum, d) => sum + d.price, 0) + constructor.price
    if (cost > TEAM_BUDGET + 1e-9) {
        throw badRequest(`Team costs $${cost.toFixed(1)}M — over the $${TEAM_BUDGET}M budget`)
    }

    const key = { userId_raceId_leagueId: { userId, raceId: parsedRaceId, leagueId: parsedLeagueId } }
    const existing = await prisma.team.findUnique({ where: key })
    if (existing?.locked) return res.status(400).json({ error: 'Team already locked' })

    const team = existing
        ? await prisma.team.update({
            where: { id: existing.id },
            data: {
                constructorId: parsedConstructorId,
                captainId: parsedCaptainId,
                carriedOver: false,
                predictions: { deleteMany: {}, create: teamPredictions }
            },
            include: TEAM_INCLUDE
        })
        : await prisma.team.create({
            data: {
                userId,
                raceId: parsedRaceId,
                leagueId: parsedLeagueId,
                constructorId: parsedConstructorId,
                captainId: parsedCaptainId,
                predictions: { create: teamPredictions }
            },
            include: TEAM_INCLUDE
        })

    res.json({ message: 'Team saved', team: formatTeam(team) })
}

export const updatePredictionPosition = async (req, res) => {
    const userId = req.user.id
    const raceId = parseId(req.params.raceId, 'Race ID')
    const leagueId = parseId(req.body?.leagueId, 'League ID')
    const driverId = parseId(req.body?.driverId, 'Driver ID')
    const predictedPosition = normalizePredictedPosition(req.body?.predictedPosition ?? req.body?.position)

    if (predictedPosition === null) throw badRequest('Predicted position is required')

    const team = await prisma.team.findUnique({
        where: { userId_raceId_leagueId: { userId, raceId, leagueId } },
        include: { predictions: true, race: true }
    })
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (team.locked) return res.status(400).json({ error: 'Team already locked' })
    assertRaceOpen(team.race)

    if (!team.predictions.some(p => p.driverId === driverId)) {
        return res.status(404).json({ error: 'Driver is not in this team' })
    }
    if (team.predictions.some(p => p.driverId !== driverId && p.predictedPosition === predictedPosition)) {
        return res.status(409).json({ error: 'Predicted position already assigned' })
    }

    const updated = await prisma.prediction.update({
        where: { teamId_driverId: { teamId: team.id, driverId } },
        data: { predictedPosition },
        include: { driver: true }
    })

    res.json({
        message: 'Prediction updated',
        prediction: { driverId: updated.driverId, driverName: updated.driver.name, predictedPosition: updated.predictedPosition }
    })
}

export const lockMyTeam = async (req, res) => {
    const raceId = parseId(req.body?.raceId, 'Race ID')
    const leagueId = parseId(req.body?.leagueId, 'League ID')

    const team = await prisma.team.findUnique({
        where: { userId_raceId_leagueId: { userId: req.user.id, raceId, leagueId } },
        include: { race: true }
    })
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (team.locked) return res.status(400).json({ error: 'Already locked' })
    assertRaceOpen(team.race)

    await prisma.team.update({ where: { id: team.id }, data: { locked: true } })
    res.json({ message: 'Team locked' })
}

export const getMyTeam = async (req, res) => {
    const raceId = parseId(req.params.raceId, 'Race ID')
    const leagueId = parseId(req.query.leagueId, 'League ID')

    const team = await prisma.team.findUnique({
        where: { userId_raceId_leagueId: { userId: req.user.id, raceId, leagueId } },
        include: TEAM_INCLUDE
    })
    if (!team) return res.status(404).json({ error: 'No team found' })

    const points = await prisma.points.findUnique({
        where: { userId_raceId_leagueId: { userId: req.user.id, raceId, leagueId } }
    })

    res.json({ ...formatTeam(team), points: points?.totalPts ?? null, breakdown: points?.breakdown ?? null })
}

// The player's most recent team in this league before the given race (used to prefill the builder).
export const getPreviousTeam = async (req, res) => {
    const raceId = parseId(req.params.raceId, 'Race ID')
    const leagueId = parseId(req.query.leagueId, 'League ID')
    const race = await prisma.race.findUnique({ where: { id: raceId } })
    if (!race) return res.status(404).json({ error: 'Race not found' })

    const team = await prisma.team.findFirst({
        where: { userId: req.user.id, leagueId, race: { raceStart: { lt: race.raceStart } } },
        include: { ...TEAM_INCLUDE, race: { select: { name: true } } },
        orderBy: { race: { raceStart: 'desc' } }
    })
    if (!team) return res.status(404).json({ error: 'No previous team' })
    res.json({ ...formatTeam(team), fromRace: team.race.name })
}

export const unlockTeamAdmin = async (req, res) => {
    const teamId = parseId(req.body?.teamId, 'Team ID')
    await prisma.team.update({ where: { id: teamId }, data: { locked: false } })
    res.json({ message: 'Team unlocked (admin)' })
}

export const autoLockTeamsForRace = async (req, res) => {
    const raceId = parseId(req.params.raceId, 'Race ID')
    const { count } = await prisma.team.updateMany({ where: { raceId, locked: false }, data: { locked: true } })
    res.json({ message: 'All teams locked', count })
}
