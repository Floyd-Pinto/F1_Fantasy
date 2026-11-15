import { EventEmitter } from 'node:events'

// In-process pub/sub for live race updates. Each race publishes on channel `race:<id>`;
// SSE clients subscribe to it. The latest snapshot is cached so late joiners get state immediately.
const bus = new EventEmitter()
bus.setMaxListeners(0)

const latest = new Map() // raceId -> snapshot

export const publishRaceUpdate = (raceId, snapshot) => {
    latest.set(raceId, snapshot)
    bus.emit(`race:${raceId}`, snapshot)
}

const getLatestSnapshot = (raceId) => latest.get(raceId) || null

export const clearSnapshot = (raceId) => latest.delete(raceId)

const subscribeToRace = (raceId, listener) => {
    bus.on(`race:${raceId}`, listener)
    return () => bus.off(`race:${raceId}`, listener)
}

// Express handler factory: streams a race's updates as Server-Sent Events.
export const streamRace = (loadInitial) => async (req, res) => {
    const raceId = Number(req.params.id)
    if (!Number.isInteger(raceId) || raceId <= 0) {
        return res.status(400).json({ error: 'Invalid race ID' })
    }

    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no' // disable proxy buffering (nginx / Render)
    })
    res.flushHeaders()

    const send = (snapshot) => res.write(`event: update\ndata: ${JSON.stringify(snapshot)}\n\n`)

    const initial = getLatestSnapshot(raceId) || (await loadInitial(raceId))
    if (initial) send(initial)

    const unsubscribe = subscribeToRace(raceId, send)
    // Comment line keeps idle connections from being closed by proxies.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000)

    req.on('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
    })
}
