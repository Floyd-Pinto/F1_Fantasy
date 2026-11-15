import cron from 'node-cron'
import prisma from '../config/db.js'

/*
 * At lock time (first scoring session of the weekend):
 *  1. Carry over: any league member without a team gets a copy of their most recent team in that
 *     league, so forgetting one weekend doesn't mean scoring zero. Predictions are race-specific and
 *     are not copied.
 *  2. Lock every team for the race.
 */
export const carryOverTeams = async (race) => {
    const leagues = await prisma.league.findMany({ include: { members: true } })
    let carried = 0

    for (const league of leagues) {
        const entered = new Set(
            (await prisma.team.findMany({ where: { raceId: race.id, leagueId: league.id }, select: { userId: true } })).map(t => t.userId)
        )
        for (const member of league.members) {
            if (entered.has(member.userId)) continue
            const previous = await prisma.team.findFirst({
                where: { userId: member.userId, leagueId: league.id, race: { raceStart: { lt: race.raceStart } } },
                include: { predictions: true },
                orderBy: { race: { raceStart: 'desc' } }
            })
            if (!previous) continue
            await prisma.team.create({
                data: {
                    userId: member.userId,
                    raceId: race.id,
                    leagueId: league.id,
                    constructorId: previous.constructorId,
                    captainId: previous.captainId,
                    carriedOver: true,
                    locked: true,
                    predictions: { create: previous.predictions.map(p => ({ driverId: p.driverId, predictedPosition: null })) }
                }
            })
            carried++
        }
    }
    return carried
}

export const lockStartedRaces = async () => {
    const now = new Date()
    const due = await prisma.race.findMany({ where: { carryOverDone: false, status: 'SCHEDULED', lockAt: { lte: now } } })
    for (const race of due) {
        const carried = await carryOverTeams(race)
        await prisma.race.update({ where: { id: race.id }, data: { carryOverDone: true } })
        if (carried) console.log(`[auto-lock] carried over ${carried} team(s) for ${race.name}`)
    }

    const { count } = await prisma.team.updateMany({
        where: { locked: false, race: { lockAt: { lte: now } } },
        data: { locked: true }
    })
    if (count > 0) console.log(`[auto-lock] locked ${count} team(s)`)
}

export const startAutoLockJob = () =>
    cron.schedule('* * * * *', async () => {
        try {
            await lockStartedRaces()
        } catch (err) {
            // Never let a transient DB error crash the process.
            console.error('[auto-lock] failed:', err.message)
        }
    })
