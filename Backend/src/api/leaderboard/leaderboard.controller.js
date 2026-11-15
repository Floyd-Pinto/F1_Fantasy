import prisma from '../../config/db.js'
import { parseId } from '../../utils/http.js'

// Standard competition ranking: ties share a rank (1, 2, 2, 4).
const withRanks = (rows, key) => {
    let rank = 0
    return rows.map((row, i) => {
        if (i === 0 || row[key] !== rows[i - 1][key]) rank = i + 1
        return { rank, ...row }
    })
}

const assertCanView = async (leagueId, user) => {
    const league = await prisma.league.findUnique({ where: { id: leagueId } })
    if (!league) return null
    if (league.league_type === 'PRIVATE' && user.role !== 'ADMIN') {
        const member = await prisma.leagueMember.findUnique({
            where: { leagueId_userId: { leagueId, userId: user.id } }
        })
        if (!member) return null
    }
    return league
}

// Season standings for a league — every member appears, including those on 0 points.
export const getLeagueLeaderboard = async (req, res) => {
    const leagueId = parseId(req.params.leagueId, 'League ID')
    if (!(await assertCanView(leagueId, req.user))) {
        return res.status(404).json({ error: 'League not found' })
    }

    const [members, totals] = await Promise.all([
        prisma.leagueMember.findMany({
            where: { leagueId },
            include: { user: { select: { id: true, username: true } } }
        }),
        prisma.points.groupBy({
            by: ['userId'],
            where: { leagueId },
            _sum: { totalPts: true },
            _count: { raceId: true }
        })
    ])

    const totalsByUser = new Map(totals.map(t => [t.userId, t]))
    const rows = members
        .map(m => ({
            userId: m.user.id,
            username: m.user.username,
            season_total: totalsByUser.get(m.user.id)?._sum.totalPts || 0,
            races_played: totalsByUser.get(m.user.id)?._count.raceId || 0
        }))
        .sort((a, b) => b.season_total - a.season_total || a.username.localeCompare(b.username))

    res.json(withRanks(rows, 'season_total'))
}

export const getRaceLeaderboard = async (req, res) => {
    const leagueId = parseId(req.params.leagueId, 'League ID')
    const raceId = parseId(req.params.raceId, 'Race ID')
    if (!(await assertCanView(leagueId, req.user))) {
        return res.status(404).json({ error: 'League not found' })
    }

    const data = await prisma.points.findMany({
        where: { leagueId, raceId },
        include: { user: { select: { id: true, username: true } } },
        orderBy: { totalPts: 'desc' }
    })

    res.json(withRanks(data.map(entry => ({
        userId: entry.user.id,
        username: entry.user.username,
        total_pts: entry.totalPts,
        breakdown: entry.breakdown
    })), 'total_pts'))
}

// Points per race and running totals for every member — powers the league chart.
export const getLeagueHistory = async (req, res) => {
    const leagueId = parseId(req.params.leagueId, 'League ID')
    if (!(await assertCanView(leagueId, req.user))) {
        return res.status(404).json({ error: 'League not found' })
    }

    const [members, points] = await Promise.all([
        prisma.leagueMember.findMany({ where: { leagueId }, include: { user: { select: { id: true, username: true } } } }),
        prisma.points.findMany({ where: { leagueId }, select: { userId: true, raceId: true, totalPts: true } })
    ])
    const raceIds = [...new Set(points.map(p => p.raceId))]
    const races = await prisma.race.findMany({
        where: { id: { in: raceIds }, status: 'COMPLETED' },
        select: { id: true, name: true, round: true },
        orderBy: { raceStart: 'asc' }
    })

    const pts = new Map(points.map(p => [`${p.userId}:${p.raceId}`, p.totalPts]))
    res.json({
        races: races.map(r => ({ id: r.id, name: r.name, round: r.round })),
        players: members.map(m => {
            let running = 0
            const perRace = races.map(r => pts.get(`${m.user.id}:${r.id}`) ?? 0)
            return {
                userId: m.user.id,
                username: m.user.username,
                perRace,
                cumulative: perRace.map(p => (running += p))
            }
        })
    })
}

// Global ranking. A player in several leagues scores once per race: their best entry for that race.
export const getGlobalLeaderboard = async (req, res) => {
    const [users, points] = await Promise.all([
        prisma.user.findMany({ select: { id: true, username: true } }),
        prisma.points.findMany({ select: { userId: true, raceId: true, totalPts: true } })
    ])

    const best = new Map() // `${userId}:${raceId}` -> pts
    for (const p of points) {
        const k = `${p.userId}:${p.raceId}`
        best.set(k, Math.max(best.get(k) ?? 0, p.totalPts))
    }
    const totals = new Map()
    const races = new Map()
    for (const [k, pts] of best) {
        const userId = Number(k.split(':')[0])
        totals.set(userId, (totals.get(userId) || 0) + pts)
        races.set(userId, (races.get(userId) || 0) + 1)
    }

    const ranked = withRanks(
        users
            .map(u => ({ userId: u.id, username: u.username, totalPts: totals.get(u.id) || 0, racesPlayed: races.get(u.id) || 0 }))
            .sort((a, b) => b.totalPts - a.totalPts || a.username.localeCompare(b.username)),
        'totalPts'
    )

    // Current race = a running one, else the most recently completed.
    const currentRace =
        (await prisma.race.findFirst({ where: { status: 'ONGOING' }, orderBy: { raceStart: 'desc' } })) ||
        (await prisma.race.findFirst({ where: { status: 'COMPLETED' }, orderBy: { raceStart: 'desc' } }))

    let currentRaceInfo = null
    if (currentRace) {
        const perUser = new Map()
        for (const p of points) {
            if (p.raceId === currentRace.id) perUser.set(p.userId, Math.max(perUser.get(p.userId) ?? 0, p.totalPts))
        }
        const maxPoints = Math.max(0, ...perUser.values())
        const names = new Map(users.map(u => [u.id, u.username]))
        currentRaceInfo = {
            raceId: currentRace.id,
            name: currentRace.name,
            status: currentRace.status,
            maxPoints,
            leaders: [...perUser]
                .filter(([, pts]) => pts === maxPoints && maxPoints > 0)
                .map(([userId, pts]) => ({ userId, username: names.get(userId), points: pts }))
        }
    }

    const me = ranked.find(u => u.userId === req.user.id) || null

    res.json({
        max_overall: ranked[0] || null,
        current_race: currentRaceInfo,
        top: ranked.slice(0, 50),
        total_players: ranked.length,
        user: me
    })
}
