import prisma from '../../config/db.js'
import { parseId, badRequest } from '../../utils/http.js'
import { calculateRacePoints } from '../results/results.service.js'
import { getReplay } from '../../services/replay.service.js'
import { activeSimulations, buildSnapshot } from '../../live/raceRunner.js'

// A race only counts as COMPLETED once its official results are in.
// Between lights out and that moment it's ONGOING, then RESULTS_PENDING after the scheduled end.
const computeStatus = (race) => {
    if (race.status === 'COMPLETED' || race.status === 'ONGOING') return race.status

    const now = new Date()
    if (now < race.raceStart) return 'SCHEDULED'
    if (race.raceEnd && now >= race.raceEnd) return 'RESULTS_PENDING'
    return 'ONGOING'
}

const withComputed = (race) => ({
    ...race,
    status: computeStatus(race),
    team_locked: race.status !== 'SCHEDULED' || new Date() >= (race.lockAt ?? race.raceStart),
    live: activeSimulations.has(race.id),
    // Lap-by-lap replay exists for finished real races with OpenF1 timing data.
    replay_available: race.status === 'COMPLETED' && Boolean(race.openf1SessionKey)
})

const parseDate = (value, field) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw badRequest(`${field} must be a valid date`)
    return date
}

// Whitelist of admin-editable fields (prevents writing arbitrary columns such as id).
const parseRaceInput = (body, { partial }) => {
    const data = {}
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.circuit !== undefined) data.circuit = body.circuit ? String(body.circuit).trim() : null
    if (body.raceDate !== undefined) data.raceDate = parseDate(body.raceDate, 'raceDate')
    if (body.raceStart !== undefined) data.raceStart = parseDate(body.raceStart, 'raceStart')
    if (body.lockAt !== undefined) data.lockAt = body.lockAt ? parseDate(body.lockAt, 'lockAt') : null
    if (body.raceEnd !== undefined) data.raceEnd = body.raceEnd ? parseDate(body.raceEnd, 'raceEnd') : null
    if (body.season !== undefined) {
        const season = Number(body.season)
        if (!Number.isInteger(season) || season < 1950 || season > 2100) throw badRequest('Invalid season')
        data.season = season
    }
    if (body.status !== undefined) {
        if (!['SCHEDULED', 'ONGOING', 'COMPLETED'].includes(body.status)) throw badRequest('Invalid status')
        data.status = body.status
    }

    if (!partial && (!data.name || !data.raceDate || !data.season || !data.raceStart)) {
        throw badRequest('name, raceDate, season and raceStart are required')
    }
    if (data.raceStart && data.raceEnd && data.raceEnd < data.raceStart) {
        throw badRequest('raceEnd must be after raceStart')
    }
    return data
}

export const getAllRaces = async (req, res) => {
    const season = req.query.season ? Number(req.query.season) : undefined

    const races = await prisma.race.findMany({
        where: Number.isInteger(season) ? { season } : {},
        orderBy: [{ raceDate: 'asc' }, { raceStart: 'asc' }]
    })

    res.json(races.map(withComputed))
}

export const getRaceById = async (req, res) => {
    const id = parseId(req.params.id, 'Race ID')
    const race = await prisma.race.findUnique({ where: { id } })

    if (!race) {
        return res.status(404).json({ error: 'Race not found' })
    }

    res.json(withComputed(race))
}

export const createRace = async (req, res) => {
    const data = parseRaceInput(req.body || {}, { partial: false })
    const race = await prisma.race.create({ data: { ...data, lockAt: data.lockAt ?? data.raceStart } })
    res.status(201).json(withComputed(race))
}

export const updateRace = async (req, res) => {
    const id = parseId(req.params.id, 'Race ID')

    const existing = await prisma.race.findUnique({ where: { id } })
    if (!existing) {
        return res.status(404).json({ error: 'Race not found' })
    }

    const updated = await prisma.race.update({
        where: { id },
        data: parseRaceInput(req.body || {}, { partial: true })
    })

    if (existing.status !== 'COMPLETED' && updated.status === 'COMPLETED') {
        await prisma.team.updateMany({ where: { raceId: id }, data: { locked: true } })
        await calculateRacePoints(id)
    }

    res.json(withComputed(updated))
}

export const deleteRace = async (req, res) => {
    const id = parseId(req.params.id, 'Race ID')
    if (activeSimulations.has(id)) {
        return res.status(409).json({ error: 'Stop the running simulation first' })
    }

    await prisma.$transaction([
        prisma.points.deleteMany({ where: { raceId: id } }),
        prisma.team.deleteMany({ where: { raceId: id } }),
        prisma.race.delete({ where: { id } })
    ])
    res.json({ message: 'Race deleted' })
}

// Initial payload for the live stream when no simulation is running (e.g. a finished race).
export const loadRaceSnapshot = (raceId) => buildSnapshot(raceId)

export const getRaceReplay = async (req, res) => {
    const raceId = parseId(req.params.id, 'Race ID')
    const leagueId = req.query.leagueId ? parseId(req.query.leagueId, 'League ID') : null
    res.json(await getReplay(raceId, { leagueId, user: req.user }))
}
