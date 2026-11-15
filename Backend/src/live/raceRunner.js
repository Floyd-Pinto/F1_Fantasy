import prisma from '../config/db.js'
import { calculateRacePoints, getDriverPoints } from '../api/results/results.service.js'
import { publishRaceUpdate, clearSnapshot } from './raceEvents.js'

/*
 * Runs a test race lap by lap from a "feed", writing each lap to the database, re-scoring, and
 * pushing it to the live SSE stream. Used by the simulator for admin-created test races; real races
 * are scored from official results (see services/sync.service.js), and finished real races are
 * replayed read-only (see services/replay.service.js).
 *
 * Feed interface:
 *   mode, totalLaps, intervalMs
 *   init()  -> { order: driverId[], events: [] }                 starting grid
 *   step()  -> { lap, order, dnf: Set, fastestLapId, events, done }
 */

const MAX_EVENTS = 40

// raceId -> run state
export const activeSimulations = new Map()

const rowsFor = (raceId, order, dnf, fastestLapId) => {
    let pos = 0
    return order.map(driverId => {
        const out = dnf.has(driverId)
        return {
            raceId,
            driverId,
            finishPosition: out ? null : ++pos,
            dnf: out,
            fastestLap: driverId === fastestLapId
        }
    })
}

const writeLap = async (run) => {
    await prisma.$transaction([
        prisma.raceResult.deleteMany({ where: { raceId: run.raceId } }),
        prisma.raceResult.createMany({ data: rowsFor(run.raceId, run.order, run.dnf, run.fastestLapId) })
    ])
    await calculateRacePoints(run.raceId)
}

const addEvents = (run, events = []) => {
    for (const e of events) run.events.unshift({ lap: run.lap, ...e })
    run.events.length = Math.min(run.events.length, MAX_EVENTS)
}

export const buildSnapshot = async (raceId, run = activeSimulations.get(raceId)) => {
    const race = await prisma.race.findUnique({ where: { id: raceId } })
    if (!race) return null

    const results = await prisma.raceResult.findMany({
        where: { raceId },
        include: { driver: { include: { constructor: { select: { name: true, color: true } } } } },
        orderBy: [{ dnf: 'asc' }, { finishPosition: { sort: 'asc', nulls: 'last' } }]
    })

    const totalLaps = run?.totalLaps ?? race.totalLaps ?? null
    return {
        raceId,
        name: race.name,
        circuit: race.circuit,
        status: race.status,
        live: Boolean(run && !run.finished),
        mode: run?.mode ?? null,
        lap: run?.lap ?? (race.status === 'COMPLETED' ? totalLaps : 0),
        totalLaps,
        events: run?.events ?? [],
        order: results.map(r => ({
            driver_id: r.driverId,
            driver_name: r.driver.name,
            driver_code: r.driver.code,
            driver_number: r.driver.number,
            headshot_url: r.driver.headshotUrl,
            constructor_name: r.driver.constructor?.name || null,
            team_color: r.driver.constructor?.color || null,
            finish_pos: r.finishPosition,
            dnf: r.dnf,
            fastest_lap: r.fastestLap,
            points: getDriverPoints(r)
        })),
        updatedAt: new Date().toISOString()
    }
}

const broadcast = async (run) => {
    const snapshot = await buildSnapshot(run.raceId, run)
    if (snapshot) publishRaceUpdate(run.raceId, snapshot)
}

const finish = async (run) => {
    run.finished = true
    clearInterval(run.timer)

    await prisma.$transaction([
        prisma.race.update({ where: { id: run.raceId }, data: { status: 'COMPLETED', raceEnd: new Date(), totalLaps: run.totalLaps } }),
        prisma.team.updateMany({ where: { raceId: run.raceId }, data: { locked: true } })
    ])
    await calculateRacePoints(run.raceId)

    const winner = await prisma.raceResult.findFirst({
        where: { raceId: run.raceId, finishPosition: 1 },
        include: { driver: true }
    })
    addEvents(run, [{ type: 'finish', text: `Chequered flag! ${winner?.driver.name ?? 'The leader'} wins` }])
    await broadcast(run)
    activeSimulations.delete(run.raceId)
    console.log(`[race] ${run.raceId} finished (${run.mode})`)
}

const abortOnError = async (run, err) => {
    console.error(`[race] ${run.raceId} error:`, err)
    clearInterval(run.timer)
    run.finished = true
    activeSimulations.delete(run.raceId)
    await resetRace(run.raceId).catch(() => {})
}

const tick = async (run) => {
    if (run.busy || run.finished) return // never overlap DB writes if a lap takes longer than the interval
    run.busy = true
    try {
        const step = await run.feed.step()
        run.lap = step.lap
        run.order = step.order
        run.dnf = step.dnf
        run.fastestLapId = step.fastestLapId
        addEvents(run, step.events)
        await writeLap(run)
        if (step.done) await finish(run)
        else await broadcast(run)
    } catch (err) {
        await abortOnError(run, err)
    } finally {
        run.busy = false
    }
}

export const startRace = async (raceId, feed) => {
    if (activeSimulations.has(raceId)) return { started: false, reason: 'already_running' }

    const run = {
        raceId,
        feed,
        mode: feed.mode,
        totalLaps: feed.totalLaps,
        lap: 0,
        order: [],
        dnf: new Set(),
        fastestLapId: null,
        events: [],
        busy: true,
        finished: false,
        timer: null
    }
    activeSimulations.set(raceId, run)

    try {
        const grid = await feed.init()
        run.order = grid.order
        run.totalLaps = feed.totalLaps

        // Teams freeze when the lights go out.
        await prisma.$transaction([
            prisma.race.update({ where: { id: raceId }, data: { status: 'ONGOING' } }),
            prisma.team.updateMany({ where: { raceId }, data: { locked: true } })
        ])
        addEvents(run, grid.events)
        await writeLap(run)
        await broadcast(run)
    } catch (err) {
        activeSimulations.delete(raceId)
        throw err
    } finally {
        run.busy = false
    }

    run.timer = setInterval(() => tick(run), feed.intervalMs)
    console.log(`[race] ${raceId} started (${feed.mode}, ${run.totalLaps} laps)`)
    return { started: true }
}

const resetRace = (raceId) =>
    prisma.$transaction([
        prisma.points.deleteMany({ where: { raceId } }),
        prisma.raceResult.deleteMany({ where: { raceId } }),
        prisma.race.update({ where: { id: raceId }, data: { status: 'SCHEDULED' } })
    ])

// Abort: discard partial results so the race can be run again.
export const stopRace = async (raceId) => {
    const run = activeSimulations.get(raceId)
    if (!run) return { stopped: false, reason: 'not_running' }

    clearInterval(run.timer)
    run.finished = true
    activeSimulations.delete(raceId)
    await resetRace(raceId)

    clearSnapshot(raceId)
    const snapshot = await buildSnapshot(raceId, null)
    if (snapshot) publishRaceUpdate(raceId, snapshot)
    return { stopped: true }
}

// In-memory runs don't survive a restart; reset races a previous process left ONGOING.
export const recoverInterruptedRaces = async () => {
    const stale = await prisma.race.findMany({ where: { status: 'ONGOING' } })
    for (const race of stale) {
        if (activeSimulations.has(race.id)) continue
        await resetRace(race.id)
        console.log(`[race] reset interrupted race ${race.id} (${race.name})`)
    }
}
