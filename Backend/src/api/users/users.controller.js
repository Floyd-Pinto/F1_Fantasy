import bcrypt from 'bcrypt'
import prisma from '../../config/db.js'
import { parseId, toIso } from '../../utils/http.js'
import { validateProfileFields } from '../../utils/validation.js'

const PRIVATE_FIELDS = { id: true, username: true, email: true, phone_no: true, role: true, created_at: true }

const canManage = (req, id) => req.user.id === id || req.user.role === 'ADMIN'

export const getAllUsers = async (req, res) => {
    const users = await prisma.user.findMany({
        select: PRIVATE_FIELDS,
        orderBy: { created_at: 'desc' }
    })
    res.json(users)
}

// Anyone signed in can see a public profile; email/phone are only shown to the owner or an admin.
export const getUserById = async (req, res) => {
    const id = parseId(req.params.id, 'User ID')
    const includePrivate = canManage(req, id)

    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            username: true,
            created_at: true,
            ...(includePrivate && { email: true, phone_no: true, role: true }),
            memberships: {
                select: { league: { select: { id: true, name: true, ...(includePrivate && { code: true }) } } }
            }
        }
    })

    if (!user) {
        return res.status(404).json({ error: 'User not found' })
    }

    res.json(user)
}

export const updateUserProfile = async (req, res) => {
    const id = parseId(req.params.id, 'User ID')

    if (!canManage(req, id)) {
        return res.status(403).json({ error: 'You can only update your own profile' })
    }

    const username = req.body?.username?.trim() || undefined
    const email = req.body?.email?.trim().toLowerCase() || undefined
    const phone_no = req.body?.phone_no?.trim() || undefined
    const password = req.body?.password || undefined

    const invalid = validateProfileFields({ username, email, phone_no, password })
    if (invalid) return res.status(400).json({ error: invalid })

    const userExists = await prisma.user.findUnique({ where: { id } })
    if (!userExists) {
        return res.status(404).json({ error: 'User not found' })
    }

    if (username || email || phone_no) {
        const conflict = await prisma.user.findFirst({
            where: {
                NOT: { id },
                OR: [
                    ...(username ? [{ username }] : []),
                    ...(email ? [{ email: { equals: email, mode: 'insensitive' } }] : []),
                    ...(phone_no ? [{ phone_no }] : [])
                ]
            }
        })
        if (conflict) {
            return res.status(409).json({ error: 'Username, email, or phone number already in use' })
        }
    }

    const user = await prisma.user.update({
        where: { id },
        data: {
            ...(username && { username }),
            ...(email && { email }),
            ...(phone_no && { phone_no }),
            ...(password && { password: await bcrypt.hash(password, 10) })
        },
        select: PRIVATE_FIELDS
    })

    res.json(user)
}

export const deleteUser = async (req, res) => {
    const id = parseId(req.params.id, 'User ID')

    const userExists = await prisma.user.findUnique({ where: { id } })
    if (!userExists) {
        return res.status(404).json({ error: 'User not found' })
    }

    // Remove dependent rows that don't cascade in the schema, then the user.
    await prisma.$transaction([
        prisma.points.deleteMany({ where: { userId: id } }),
        prisma.team.deleteMany({ where: { userId: id } }),
        prisma.league.updateMany({ where: { ownerId: id }, data: { ownerId: null } }),
        prisma.user.delete({ where: { id } })
    ])

    res.json({ message: 'User deleted successfully' })
}

// Everything the profile page needs: every team I entered, per league, with results and my rank.
// Breakdown entries were plain numbers before captain/prediction scoring; accept both shapes.
const driverBreakdown = (b) =>
    b == null
        ? { points: null }
        : typeof b === 'number'
            ? { points: b }
            : { points: b.total, race: b.race, sprint: b.sprint, quali: b.quali, prediction: b.prediction }

export const getMyHistory = async (req, res) => {
    const userId = req.user.id

    const teams = await prisma.team.findMany({
        where: { userId },
        include: {
            race: true,
            league: { select: { id: true, name: true } },
            constructor: { select: { id: true, name: true, color: true } },
            predictions: { include: { driver: { select: { id: true, name: true, code: true, headshotUrl: true, constructor: { select: { color: true } } } } } }
        },
        orderBy: { race: { raceStart: 'desc' } }
    })

    const raceIds = [...new Set(teams.map(t => t.raceId))]
    const leagueIds = [...new Set(teams.map(t => t.leagueId))]
    const [points, results] = await Promise.all([
        prisma.points.findMany({ where: { raceId: { in: raceIds }, leagueId: { in: leagueIds } } }),
        prisma.raceResult.findMany({ where: { raceId: { in: raceIds } } })
    ])

    const resultOf = new Map(results.map(r => [`${r.raceId}:${r.driverId}`, r]))
    const pointsByRaceLeague = new Map()
    for (const p of points) {
        const k = `${p.raceId}:${p.leagueId}`
        if (!pointsByRaceLeague.has(k)) pointsByRaceLeague.set(k, [])
        pointsByRaceLeague.get(k).push(p)
    }

    const entries = teams.map(t => {
        const field = (pointsByRaceLeague.get(`${t.raceId}:${t.leagueId}`) || []).sort((a, b) => b.totalPts - a.totalPts)
        const mine = field.find(p => p.userId === userId)
        const rank = mine ? field.filter(p => p.totalPts > mine.totalPts).length + 1 : null
        const breakdown = mine?.breakdown || {}
        return {
            teamId: t.id,
            locked: t.locked,
            carriedOver: t.carriedOver,
            race: { id: t.race.id, name: t.race.name, round: t.race.round, season: t.race.season, raceStart: toIso(t.race.raceStart), status: t.race.status, replay_available: t.race.status === 'COMPLETED' && Boolean(t.race.openf1SessionKey) },
            league: t.league,
            totalPts: mine?.totalPts ?? null,
            rank,
            fieldSize: field.length,
            constructor: t.constructor && { ...t.constructor, points: breakdown.constructor?.points ?? null },
            drivers: t.predictions.map(p => {
                const r = resultOf.get(`${t.raceId}:${p.driverId}`)
                return {
                    id: p.driver.id,
                    name: p.driver.name,
                    code: p.driver.code,
                    headshotUrl: p.driver.headshotUrl,
                    color: p.driver.constructor?.color ?? null,
                    finishPosition: r?.finishPosition ?? null,
                    dnf: r?.dnf ?? false,
                    fastestLap: r?.fastestLap ?? false,
                    ...driverBreakdown(breakdown.drivers?.[p.driverId]),
                    captain: t.captainId === p.driverId,
                    predictedPosition: p.predictedPosition
                }
            })
        }
    })

    const completed = entries.filter(e => e.race.status === 'COMPLETED')
    res.json({
        user: req.user,
        stats: {
            racesPlayed: completed.length,
            totalPoints: completed.reduce((s, e) => s + (e.totalPts || 0), 0),
            bestRace: completed.reduce((best, e) => (e.totalPts ?? -1) > (best?.totalPts ?? -1) ? e : best, null),
            wins: completed.filter(e => e.rank === 1 && e.fieldSize > 1).length
        },
        upcoming: entries.filter(e => e.race.status !== 'COMPLETED'),
        past: completed
    })
}
