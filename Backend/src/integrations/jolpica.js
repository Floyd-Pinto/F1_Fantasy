import { createClient } from './http.js'

// Jolpica-F1: free, open successor to the Ergast API (https://github.com/jolpica/jolpica-f1).
// Limits: ~4 req/s burst, ~500 req/hour — we stay well under.
const client = createClient({ baseUrl: 'https://api.jolpi.ca/ergast/f1', minIntervalMs: 400, name: 'Jolpica' })

const pageAll = async (path, pick) => {
    const limit = 100
    let offset = 0
    let all = []
    for (;;) {
        const sep = path.includes('?') ? '&' : '?'
        const data = await client.get(`${path}${sep}limit=${limit}&offset=${offset}`)
        all = all.concat(pick(data.MRData))
        offset += limit
        if (offset >= Number(data.MRData.total)) return all
    }
}

export const getSchedule = async (season) =>
    (await client.get(`/${season}.json`)).MRData.RaceTable.Races

export const getDriverStandings = async (season) =>
    (await client.get(`/${season}/driverStandings.json`)).MRData.StandingsTable.StandingsLists[0]?.DriverStandings || []

export const getConstructorStandings = async (season) =>
    (await client.get(`/${season}/constructorStandings.json`)).MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings || []

export const getConstructors = (season) =>
    pageAll(`/${season}/constructors.json`, m => m.ConstructorTable.Constructors)

export const getDrivers = (season) =>
    pageAll(`/${season}/drivers.json`, m => m.DriverTable.Drivers)

// Rows arrive one per driver per race across pages; regroup by round.
// kind: 'results' (race), 'qualifying' or 'sprint'. Each round gets a uniform `Results` array.
const SESSION_KEYS = { results: 'Results', qualifying: 'QualifyingResults', sprint: 'SprintResults' }

export const getSeasonResults = async (season, kind = 'results') => {
    const key = SESSION_KEYS[kind]
    const races = await pageAll(`/${season}/${kind}.json`, m => m.RaceTable.Races)
    const byRound = new Map()
    for (const race of races) {
        const rows = race[key] || []
        const existing = byRound.get(race.round)
        if (existing) existing.Results.push(...rows)
        else byRound.set(race.round, { ...race, Results: [...rows] })
    }
    return [...byRound.values()]
}

export const getRoundDriverStandings = async (season, round) =>
    (await client.get(`/${season}/${round}/driverStandings.json`)).MRData.StandingsTable.StandingsLists[0]?.DriverStandings || []

// Jolpica "status" → did the driver finish? Classified finishers are "Finished", "Lapped" or "+N Lap(s)".
export const isClassifiedFinish = (status) =>
    status === 'Finished' || status === 'Lapped' || /^\+\d+ Laps?$/.test(status)
