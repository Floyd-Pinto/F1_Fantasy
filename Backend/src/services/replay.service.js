import prisma from '../config/db.js'
import { createReplayFeed } from '../live/feeds/openf1Replay.js'
import { qualiPoints, sprintPoints } from '../scoring/scoring.js'
import { httpError } from '../utils/http.js'

/*
 * Lap-by-lap replays of finished real races. Built once from OpenF1's free historical timing data,
 * stored in RaceReplay, then served to every viewer from the database. Replays are read-only:
 * they never touch results or fantasy points.
 *
 * Frame: { lap, order: driverId[] (running order, retirements last), dnf: driverId[], fl: driverId|null, events }
 */

const building = new Map() // raceId -> in-flight build promise


const buildFrames = async (race) => {
    const feed = await createReplayFeed(race)
    const grid = await feed.init()
    const frames = [{ lap: 0, order: grid.order, dnf: [], fl: null, events: grid.events }]
    for (;;) {
        const step = await feed.step()
        frames.push({ lap: step.lap, order: step.order, dnf: [...step.dnf], fl: step.fastestLapId, events: step.events })
        if (step.done) break
    }
    return { frames, totalLaps: feed.totalLaps }
}

export const getReplayFrames = async (raceId) => {
    const cached = await prisma.raceReplay.findUnique({ where: { raceId } })
    if (cached) return cached

    const race = await prisma.race.findUnique({ where: { id: raceId } })
    if (!race) throw httpError(404, 'Race not found')
    if (race.status !== 'COMPLETED') throw httpError(409, 'Replays are available once a race has finished')

    if (!building.has(raceId)) {
        building.set(raceId, (async () => {
            const { frames, totalLaps } = await buildFrames(race)
            return prisma.raceReplay.upsert({
                where: { raceId },
                update: { frames, totalLaps },
                create: { raceId, frames, totalLaps }
            })
        })().finally(() => building.delete(raceId)))
    }
    return building.get(raceId)
}

// Everything the replay player needs: drivers, frames and (optionally) a league's teams for that race.
export const getReplay = async (raceId, { leagueId, user } = {}) => {
    const replay = await getReplayFrames(raceId)
    const race = await prisma.race.findUnique({ where: { id: raceId } })

    const driverIds = [...new Set(replay.frames.flatMap(f => f.order))]
    const drivers = await prisma.driver.findMany({
        where: { id: { in: driverIds } },
        include: { constructor: { select: { id: true, name: true, color: true } } }
    })

    let teams = []
    if (leagueId) {
        const league = await prisma.league.findUnique({ where: { id: leagueId } })
        const member = league && await prisma.leagueMember.findUnique({
            where: { leagueId_userId: { leagueId, userId: user.id } }
        })
        if (!league || (league.league_type === 'PRIVATE' && !member && user.role !== 'ADMIN')) {
            throw httpError(404, 'League not found')
        }
        const rows = await prisma.team.findMany({
            where: { raceId, leagueId },
            include: { user: { select: { id: true, username: true } }, predictions: true }
        })
        teams = rows.map(t => ({
            userId: t.user.id,
            username: t.user.username,
            driverIds: t.predictions.map(p => p.driverId),
            predictions: Object.fromEntries(t.predictions.filter(p => p.predictedPosition).map(p => [p.driverId, p.predictedPosition])),
            captainId: t.captainId,
            constructorId: t.constructorId
        }))
    }

    // Qualifying and sprint happen before the race, so they're banked from lap 0 of the replay.
    const results = await prisma.raceResult.findMany({ where: { raceId } })
    const preRace = Object.fromEntries(results.map(r => [r.driverId, { quali: qualiPoints(r), sprint: sprintPoints(r) }]))

    return {
        race: { id: race.id, name: race.name, circuit: race.circuit, round: race.round, season: race.season },
        preRace,
        totalLaps: replay.totalLaps,
        drivers: drivers.map(d => ({
            id: d.id,
            name: d.name,
            code: d.code,
            number: d.number,
            headshotUrl: d.headshotUrl,
            constructorId: d.constructor?.id ?? null,
            constructorName: d.constructor?.name ?? null,
            color: d.constructor?.color ?? null
        })),
        frames: replay.frames,
        teams
    }
}
