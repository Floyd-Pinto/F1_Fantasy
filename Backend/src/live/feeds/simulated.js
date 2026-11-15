import prisma from '../../config/db.js'
import { badRequest } from '../../utils/http.js'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Synthetic race. Pace comes from fantasy price (the market encodes who is quick).
export const createSimulatedFeed = async ({
    totalLaps = Number(process.env.SIM_LAPS) || 30,
    intervalMs = Number(process.env.SIM_LAP_MS) || 3000
} = {}) => {
    const drivers = await prisma.driver.findMany({ where: { active: true } })
    if (drivers.length < 2) {
        throw badRequest('Add at least two active drivers first')
    }

    const prices = drivers.map(d => d.price)
    const min = Math.min(...prices)
    const span = Math.max(...prices) - min || 1
    const byId = new Map(drivers.map(d => [d.id, { ...d, skill: 0.5 + 0.5 * ((d.price - min) / span) }]))

    let order = [...byId.values()]
        .map(d => ({ d, q: d.skill + (Math.random() - 0.5) * 0.35 }))
        .sort((a, b) => b.q - a.q)
        .map(x => x.d.id)
    const dnf = new Set()
    let fastestLapId = null
    let lap = 0

    return {
        mode: 'simulated',
        totalLaps,
        intervalMs,
        async init() {
            return { order, events: [{ type: 'start', text: `Lights out! ${byId.get(order[0]).name} starts from pole` }] }
        },
        async step() {
            lap++
            const events = []
            const running = order.filter(id => !dnf.has(id))

            for (let i = running.length - 1; i > 0; i--) {
                const behind = byId.get(running[i])
                const ahead = byId.get(running[i - 1])
                if (Math.random() < clamp(0.06 + (behind.skill - ahead.skill) * 0.5, 0.02, 0.5)) {
                    running[i - 1] = behind.id
                    running[i] = ahead.id
                    if (i <= 10) events.push({ type: 'overtake', text: `${behind.name} passes ${ahead.name} for P${i}` })
                }
            }

            for (const id of running) {
                if (Math.random() < 0.004 * (1.5 - byId.get(id).skill)) {
                    dnf.add(id)
                    events.push({ type: 'dnf', text: `${byId.get(id).name} retires from the race` })
                }
            }

            const top10 = running.filter(id => !dnf.has(id)).slice(0, 10)
            if (top10.length && (fastestLapId === null || Math.random() < 0.15)) {
                const setter = top10[Math.floor(Math.random() * top10.length)]
                if (setter !== fastestLapId) {
                    fastestLapId = setter
                    events.push({ type: 'fastest_lap', text: `${byId.get(setter).name} sets the fastest lap` })
                }
            }

            order = [...running.filter(id => !dnf.has(id)), ...order.filter(id => dnf.has(id))]
            return { lap, order, dnf: new Set(dnf), fastestLapId, events, done: lap >= totalLaps }
        }
    }
}
