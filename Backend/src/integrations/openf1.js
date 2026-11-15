import { createClient } from './http.js'

// OpenF1 (https://openf1.org): free historical timing data from 2023 onward, no API key.
// Data is "live" (paid) from 30 min before a session until 30 min after it ends; after that it is free.
// Free tier: 3 req/s and 30 req/min, so we space requests ~2.1s apart.
const client = createClient({ baseUrl: 'https://api.openf1.org/v1', minIntervalMs: 2100, name: 'OpenF1' })

export const FREE_AFTER_SESSION_MS = 30 * 60 * 1000

export const getRaceSessions = (year) => client.get(`/sessions?year=${year}&session_name=Race`)
export const getSessionDrivers = (sessionKey) => client.get(`/drivers?session_key=${sessionKey}`)
export const getPositions = (sessionKey) => client.get(`/position?session_key=${sessionKey}`)
export const getLaps = (sessionKey) => client.get(`/laps?session_key=${sessionKey}`)
export const getSession = async (sessionKey) => (await client.get(`/sessions?session_key=${sessionKey}`))[0] || null

// Whether a session's data has left OpenF1's paid live window and is free to read.
export const isFreelyAvailable = (session, now = Date.now()) =>
    Boolean(session?.date_end) && now >= new Date(session.date_end).getTime() + FREE_AFTER_SESSION_MS
