import prisma from '../../config/db.js'
import * as openf1 from '../../integrations/openf1.js'
import { httpError } from '../../utils/http.js'

const ms = (iso) => new Date(iso).getTime()
const MAX_OVERTAKE_EVENTS_PER_LAP = 4


/*
 * Rebuilds a real race lap by lap from OpenF1 historical timing (free once a session is 30 min over).
 * Consumed by services/replay.service.js, which turns it into cached, read-only replay frames.
 * For each lap n we take the moment the leader starts lap n+1 and reconstruct the running order,
 * retirements, pit stops and fastest lap as of that instant.
 */
export const createReplayFeed = async (race) => {
    if (!race.openf1SessionKey) throw httpError(400, 'This race has no OpenF1 session — run a sync first')

    const session = await openf1.getSession(race.openf1SessionKey)
    if (!session) throw httpError(404, 'OpenF1 session not found')
    if (!openf1.isFreelyAvailable(session)) {
        throw httpError(409, 'Timing data becomes free 30 minutes after the race ends — try again then')
    }

    const [sessionDrivers, positions, laps] = [
        await openf1.getSessionDrivers(race.openf1SessionKey),
        await openf1.getPositions(race.openf1SessionKey),
        await openf1.getLaps(race.openf1SessionKey)
    ]
    if (!positions.length || !laps.length) throw httpError(404, 'No timing data published for this race')

    // OpenF1 car number -> our driver (matched on the 3-letter code).
    const dbDrivers = await prisma.driver.findMany({ select: { id: true, name: true, code: true } })
    const byCode = new Map(dbDrivers.map(d => [d.code, d]))
    const carToDriver = new Map()
    for (const d of sessionDrivers) {
        const match = byCode.get(d.name_acronym)
        if (match) carToDriver.set(d.driver_number, match)
    }
    if (carToDriver.size < 2) throw httpError(400, 'Drivers do not match the OpenF1 grid — run a sync first')

    const name = (car) => carToDriver.get(car)?.name ?? `#${car}`
    const totalLaps = Math.max(...laps.map(l => l.lap_number))

    // When the leader started each lap.
    const lapStart = new Map()
    for (const l of laps) {
        if (!l.date_start) continue
        const t = ms(l.date_start)
        if (!lapStart.has(l.lap_number) || t < lapStart.get(l.lap_number)) lapStart.set(l.lap_number, t)
    }
    const lapsByCar = new Map()
    for (const l of laps) {
        if (!lapsByCar.has(l.driver_number)) lapsByCar.set(l.driver_number, [])
        lapsByCar.get(l.driver_number).push(l)
    }
    const raceEndT = Math.max(...laps.map(l => (l.date_start ? ms(l.date_start) + (l.lap_duration || 0) * 1000 : 0)))
    const checkpoint = (n) => (n >= totalLaps ? raceEndT : lapStart.get(n + 1) ?? raceEndT)

    // A car that stops lapping well before the end has retired; it is "out" once its last lap would be over.
    const retiredAt = new Map()
    for (const car of carToDriver.keys()) {
        const own = lapsByCar.get(car) || []
        const last = own.reduce((a, b) => (b.lap_number > (a?.lap_number ?? 0) ? b : a), null)
        if (!last) retiredAt.set(car, -Infinity) // never started
        else if (last.lap_number < totalLaps - 3) {
            retiredAt.set(car, ms(last.date_start || session.date_start) + (last.lap_duration || 120) * 1000)
        }
    }

    const sortedPositions = [...positions].sort((a, b) => ms(a.date) - ms(b.date))
    let cursor = 0
    const currentPos = new Map()
    const advanceTo = (t) => {
        while (cursor < sortedPositions.length && ms(sortedPositions[cursor].date) <= t) {
            const p = sortedPositions[cursor++]
            currentPos.set(p.driver_number, p.position)
        }
    }

    const completedLaps = laps
        .filter(l => l.date_start && l.lap_duration)
        .map(l => ({ car: l.driver_number, end: ms(l.date_start) + l.lap_duration * 1000, dur: l.lap_duration }))
        .sort((a, b) => a.end - b.end)

    const pitOuts = laps
        .filter(l => l.is_pit_out_lap && l.date_start && l.lap_number > 1)
        .map(l => ({ car: l.driver_number, t: ms(l.date_start) }))

    let lap = 0
    let prevT = lapStart.get(1) ?? ms(session.date_start)
    let prevOrder = []
    let fastest = null
    const knownDnf = new Set()

    const orderAt = (t) => {
        advanceTo(t)
        const cars = [...carToDriver.keys()]
        const out = cars.filter(c => (retiredAt.get(c) ?? Infinity) <= t)
        const running = cars
            .filter(c => !out.includes(c))
            .sort((a, b) => (currentPos.get(a) ?? 99) - (currentPos.get(b) ?? 99))
        return { running, out }
    }

    const toIds = (cars) => cars.map(c => carToDriver.get(c).id)

    return {
        mode: 'replay',
        totalLaps,
        async init() {
            const { running, out } = orderAt(prevT)
            prevOrder = running
            out.forEach(c => knownDnf.add(c))
            return {
                order: toIds([...running, ...out]),
                events: [{ type: 'start', text: `Replaying the real ${race.name}: ${name(running[0])} leads into turn 1` }]
            }
        },
        async step() {
            lap++
            const t = checkpoint(lap)
            const { running, out } = orderAt(t)
            const events = []

            for (const c of out) {
                if (!knownDnf.has(c)) {
                    knownDnf.add(c)
                    events.push({ type: 'dnf', text: `${name(c)} retires from the race` })
                }
            }
            for (const p of pitOuts) {
                if (p.t > prevT && p.t <= t) events.push({ type: 'pit', text: `${name(p.car)} pits` })
            }

            const before = new Map(prevOrder.map((c, i) => [c, i]))
            let overtakes = 0
            running.slice(0, 10).forEach((c, i) => {
                const was = before.get(c)
                if (was !== undefined && i < was && overtakes < MAX_OVERTAKE_EVENTS_PER_LAP) {
                    overtakes++
                    events.push({ type: 'overtake', text: `${name(c)} up to P${i + 1}` })
                }
            })

            for (const l of completedLaps) {
                if (l.end > t) break
                if (!fastest || l.dur < fastest.dur) {
                    const changed = !fastest || fastest.car !== l.car
                    fastest = l
                    if (changed && l.end > prevT) {
                        events.push({ type: 'fastest_lap', text: `${name(l.car)} sets the fastest lap (${l.dur.toFixed(3)}s)` })
                    }
                }
            }

            prevT = t
            prevOrder = running
            return {
                lap,
                order: toIds([...running, ...out]),
                dnf: new Set(toIds([...knownDnf])),
                fastestLapId: fastest ? carToDriver.get(fastest.car)?.id ?? null : null,
                events,
                done: lap >= totalLaps
            }
        }
    }
}
