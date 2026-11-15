import crypto from 'node:crypto'
import prisma from '../../config/db.js'
import { parseId } from '../../utils/http.js'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I to avoid confusion
const LEAGUE_TYPES = ['PUBLIC', 'PRIVATE']

const generateCode = () =>
    Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('')

const isMember = async (leagueId, userId) =>
    Boolean(await prisma.leagueMember.findUnique({
        where: { leagueId_userId: { leagueId, userId } }
    }))

export const createLeague = async (req, res) => {
    const name = req.body?.name?.trim()
    const leagueType = (req.body?.league_type || 'PRIVATE').toUpperCase()
    const userId = req.user.id

    if (!name) {
        return res.status(400).json({ error: 'League name required' })
    }
    if (name.length > 100) {
        return res.status(400).json({ error: 'League name must be 100 characters or fewer' })
    }
    if (!LEAGUE_TYPES.includes(leagueType)) {
        return res.status(400).json({ error: 'league_type must be PUBLIC or PRIVATE' })
    }

    let code
    for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateCode()
        if (!(await prisma.league.findUnique({ where: { code: candidate } }))) {
            code = candidate
            break
        }
    }
    if (!code) throw new Error('Could not generate a unique league code')

    const league = await prisma.league.create({
        data: {
            name,
            code,
            ownerId: userId,
            league_type: leagueType,
            members: { create: { userId } }
        }
    })

    res.status(201).json({ ...league, type: league.league_type, member_count: 1 })
}

export const joinLeague = async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : ''
    const userId = req.user.id

    if (!code) {
        return res.status(400).json({ error: 'League code required' })
    }

    const league = await prisma.league.findUnique({ where: { code } })

    if (!league) {
        return res.status(404).json({ error: 'League not found' })
    }

    if (await isMember(league.id, userId)) {
        return res.status(409).json({ error: 'Already a member' })
    }

    await prisma.leagueMember.create({ data: { leagueId: league.id, userId } })

    const memberCount = await prisma.leagueMember.count({ where: { leagueId: league.id } })

    res.json({
        message: 'Joined league',
        league: {
            id: league.id,
            name: league.name,
            code: league.code,
            type: league.league_type,
            member_count: memberCount
        }
    })
}

export const leaveLeague = async (req, res) => {
    const id = parseId(req.params.id, 'League ID')
    const userId = req.user.id

    const league = await prisma.league.findUnique({ where: { id } })
    if (!league) return res.status(404).json({ error: 'League not found' })
    if (league.ownerId === userId) {
        return res.status(400).json({ error: 'The owner cannot leave; delete the league instead' })
    }

    const { count } = await prisma.leagueMember.deleteMany({ where: { leagueId: id, userId } })
    if (!count) return res.status(404).json({ error: 'Not a member' })

    res.json({ message: 'Left league' })
}

export const getUserLeagues = async (req, res) => {
    const leagues = await prisma.league.findMany({
        where: { members: { some: { userId: req.user.id } } },
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'desc' }
    })

    res.json(leagues.map(l => ({
        id: l.id,
        name: l.name,
        code: l.code,
        type: l.league_type,
        ownerId: l.ownerId,
        member_count: l._count.members
    })))
}

export const getLeagueById = async (req, res) => {
    const id = parseId(req.params.id, 'League ID')

    const league = await prisma.league.findUnique({
        where: { id },
        include: {
            members: {
                include: { user: { select: { id: true, username: true } } },
                orderBy: { joinedAt: 'asc' }
            }
        }
    })

    if (!league) {
        return res.status(404).json({ error: 'League not found' })
    }

    const member = league.members.some(m => m.userId === req.user.id)

    // Private leagues (and their join code) are only visible to members.
    if (league.league_type === 'PRIVATE' && !member && req.user.role !== 'ADMIN') {
        return res.status(404).json({ error: 'League not found' })
    }

    res.json({
        id: league.id,
        name: league.name,
        code: league.code,
        ownerId: league.ownerId,
        type: league.league_type,
        is_member: member,
        member_count: league.members.length,
        members: league.members.map(m => ({
            userId: m.user.id,
            username: m.user.username
        }))
    })
}

export const deleteLeague = async (req, res) => {
    const id = parseId(req.params.id, 'League ID')

    const league = await prisma.league.findUnique({ where: { id } })

    if (!league) {
        return res.status(404).json({ error: 'League not found' })
    }

    if (league.ownerId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Not authorized' })
    }

    // Teams and points reference the league without cascade, so clear them first.
    await prisma.$transaction([
        prisma.points.deleteMany({ where: { leagueId: id } }),
        prisma.team.deleteMany({ where: { leagueId: id } }),
        prisma.league.delete({ where: { id } })
    ])

    res.json({ message: 'League deleted' })
}

// Public leagues expose their code so anyone can join them in one click.
export const getAllLeaguesPublic = async (req, res) => {
    const leagues = await prisma.league.findMany({
        where: { league_type: 'PUBLIC' },
        select: {
            id: true,
            name: true,
            code: true,
            _count: { select: { members: true } },
            members: { where: { userId: req.user.id }, select: { id: true } }
        },
        orderBy: { createdAt: 'desc' }
    })

    res.json(leagues.map(l => ({
        id: l.id,
        name: l.name,
        code: l.code,
        type: 'PUBLIC',
        member_count: l._count.members,
        is_member: l.members.length > 0
    })))
}

