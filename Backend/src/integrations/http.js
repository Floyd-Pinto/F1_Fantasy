// Minimal rate-limited JSON fetcher for public APIs (free tiers allow only a few requests per second).
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export const createClient = ({ baseUrl, minIntervalMs, name }) => {
    let nextSlot = 0

    const get = async (path, attempt = 0) => {
        const wait = Math.max(0, nextSlot - Date.now())
        nextSlot = Math.max(Date.now(), nextSlot) + minIntervalMs
        if (wait) await sleep(wait)

        const res = await fetch(`${baseUrl}${path}`, {
            headers: { 'User-Agent': 'f1-fantasy-app (open-source fan project)', Accept: 'application/json' },
            signal: AbortSignal.timeout(30_000)
        })

        if (res.status === 429 && attempt < 3) {
            await sleep(5_000 * (attempt + 1))
            return get(path, attempt + 1)
        }
        if (!res.ok) {
            throw new Error(`${name} ${path} failed: HTTP ${res.status}`)
        }
        return res.json()
    }

    return { get }
}
