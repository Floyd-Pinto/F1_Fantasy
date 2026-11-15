import prisma from '../config/db.js'
import * as jolpica from '../integrations/jolpica.js'
import * as openf1 from '../integrations/openf1.js'
import { saveRaceResults } from '../api/results/results.service.js'
import { activeSimulations, buildSnapshot } from '../live/raceRunner.js'
import { publishRaceUpdate } from '../live/raceEvents.js'
import { TEAM_INFO } from './teamInfo.js'
import { getLeadImage, titleFromUrl } from '../integrations/wikipedia.js'

const DEFAULT_RACE_DURATION_MS = 2 * 60 * 60 * 1000

// Fantasy price from championship rank: leader costs `max`, last place costs `min` (rounded to $0.5M).
const priceFromRank = (rank, count, min, max) => {
    if (!rank || count <= 1) return min
    const t = (count - rank) / (count - 1)
    return Math.round((min + t * (max - min)) * 2) / 2
}

const raceStartOf = (race) => new Date(`${race.date}T${race.time || '12:00:00Z'}`)

const syncConstructors = async (season, standings, colorsByConstructor) => {
    const constructors = await jolpica.getConstructors(season)
    const rankById = new Map(standings.map(s => [s.Constructor.constructorId, s]))
    const ids = new Map()

    for (const c of constructors) {
        const info = TEAM_INFO[c.constructorId] || {}
        const standing = rankById.get(c.constructorId)
        const rank = standing ? Number(standing.position) : null
        const data = {
            name: info.name || c.name,
            nationality: c.nationality,
            points: standing ? Math.round(Number(standing.points)) : 0,
            wins: standing ? Number(standing.wins) : 0,
            championshipPosition: rank,
            price: priceFromRank(rank, constructors.length, 8, 30),
            color: colorsByConstructor.get(c.constructorId) || undefined,
            active: true
        }
        const row = await prisma.constructor.upsert({
            where: { externalId: c.constructorId },
            // Don't overwrite a team principal an admin has edited.
            update: data,
            create: { ...data, externalId: c.constructorId, teamPrincipal: info.teamPrincipal || null }
        })
        if (row.teamPrincipal == null && info.teamPrincipal) {
            await prisma.constructor.update({ where: { id: row.id }, data: { teamPrincipal: info.teamPrincipal } })
        }
        ids.set(c.constructorId, row.id)
    }
    return ids
}

// The current grid = drivers in the most recent race OpenF1 has data for (falls back to standings).
const latestGrid = async (season) => {
    try {
        const sessions = (await openf1.getRaceSessions(season)).filter(s => openf1.isFreelyAvailable(s))
        const last = sessions.at(-1)
        if (!last) return new Map()
        const drivers = await openf1.getSessionDrivers(last.session_key)
        return new Map(drivers.map(d => [d.name_acronym, d]))
    } catch (err) {
        console.warn('[sync] OpenF1 grid unavailable:', err.message)
        return new Map()
    }
}

// Each driver's current team = the team they drove for in their most recent race.
const currentSeats = (rounds) => {
    const seats = new Map()
    for (const round of [...rounds].sort((a, b) => Number(a.round) - Number(b.round))) {
        for (const r of round.Results) seats.set(r.Driver.driverId, r.Constructor.constructorId)
    }
    return seats
}

const syncDrivers = async (season, standings, constructorIds, grid, seats, drivers) => {
    const standingById = new Map(standings.map(s => [s.Driver.driverId, s]))
    const ranked = standings.length

    for (const d of drivers) {
        const standing = standingById.get(d.driverId)
        const rank = standing ? Number(standing.position) : null
        const constructorRef = seats.get(d.driverId) ?? standing?.Constructors?.at(-1)?.constructorId
        const live = grid.get(d.code)
        // Active = on the current race grid (or, without OpenF1, scored in the championship).
        const active = grid.size ? Boolean(live) : Boolean(standing)

        const data = {
            name: `${d.givenName} ${d.familyName}`,
            code: d.code || null,
            number: live?.driver_number ?? (d.permanentNumber ? Number(d.permanentNumber) : null),
            nationality: d.nationality,
            headshotUrl: live?.headshot_url || null,
            wikiUrl: d.url || null,
            points: standing ? Math.round(Number(standing.points)) : 0,
            wins: standing ? Number(standing.wins) : 0,
            championshipPosition: rank,
            price: priceFromRank(rank ?? ranked, Math.max(ranked, 2), 6, 30),
            constructorId: constructorIds.get(constructorRef) ?? null,
            active
        }
        await prisma.driver.upsert({
            where: { externalId: d.driverId },
            update: data,
            create: { ...data, externalId: d.driverId }
        })
    }
}

// F1's media server answers missing headshots with a generic ~700-byte silhouette instead of a 404.
const placeholderCache = new Map()
const isPlaceholderImage = async (url) => {
    if (!url) return true
    if (!placeholderCache.has(url)) {
        let placeholder = true
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
            placeholder = !res.ok || (await res.arrayBuffer()).byteLength < 2_000
        } catch {
            placeholder = false // network hiccup: keep the URL rather than wrongly replacing it
        }
        placeholderCache.set(url, placeholder)
    }
    return placeholderCache.get(url)
}

// Fill image gaps: Wikipedia portraits for drivers F1 has no photo for, Wikipedia logos for teams.
const syncImages = async () => {
    const drivers = await prisma.driver.findMany({ where: { active: true } })
    for (const d of drivers) {
        if (!(await isPlaceholderImage(d.headshotUrl))) continue
        const portrait = await getLeadImage(titleFromUrl(d.wikiUrl))
        if (portrait) await prisma.driver.update({ where: { id: d.id }, data: { headshotUrl: portrait } })
    }

    // Only fill missing logos, so an admin's correction is never overwritten.
    const teams = await prisma.constructor.findMany({ where: { active: true, logoUrl: null } })
    for (const t of teams) {
        const info = TEAM_INFO[t.externalId] || {}
        const logo = await getLeadImage(info.wiki || null)
        if (logo) await prisma.constructor.update({ where: { id: t.id }, data: { logoUrl: logo } })
    }
}

const syncCalendar = async (season) => {
    const schedule = await jolpica.getSchedule(season)
    let sessionsByDate = new Map()
    try {
        const sessions = await openf1.getRaceSessions(season)
        sessionsByDate = new Map(sessions.map(s => [s.date_start.slice(0, 10), s]))
    } catch (err) {
        console.warn('[sync] OpenF1 sessions unavailable:', err.message)
    }

    for (const r of schedule) {
        const raceStart = raceStartOf(r)
        const session = sessionsByDate.get(raceStart.toISOString().slice(0, 10))
        const qualifyingStart = r.Qualifying ? raceStartOf(r.Qualifying) : null
        const sprintStart = r.Sprint ? raceStartOf(r.Sprint) : null
        // Teams lock when the first scoring session (qualifying or sprint) begins.
        const lockAt = new Date(Math.min(...[raceStart, qualifyingStart, sprintStart].filter(Boolean).map(d => d.getTime())))
        const data = {
            name: r.raceName,
            circuit: r.Circuit.circuitName,
            country: r.Circuit.Location.country,
            locality: r.Circuit.Location.locality,
            raceDate: new Date(r.date),
            raceStart,
            raceEnd: session?.date_end ? new Date(session.date_end) : new Date(raceStart.getTime() + DEFAULT_RACE_DURATION_MS),
            openf1SessionKey: session?.session_key ?? null,
            qualifyingStart,
            sprintStart,
            lockAt
        }
        await prisma.race.upsert({
            where: { season_round: { season: Number(season), round: Number(r.round) } },
            update: data,
            create: { ...data, season: Number(season), round: Number(r.round) }
        })
    }
    return schedule.length
}

// Import official results for finished rounds that don't have them yet (or all, with force).
const positionsByRound = (rounds) => {
    const map = new Map() // round -> Map<driverId, { position, finished }>
    for (const round of rounds) {
        map.set(round.round, new Map(round.Results.map(r => [r.Driver.driverId, {
            position: Number(r.position),
            finished: r.status ? jolpica.isClassifiedFinish(r.status) : true
        }])))
    }
    return map
}

const syncResults = async (season, rounds, { force, qualifying, sprints }) => {
    const drivers = await prisma.driver.findMany({ select: { id: true, externalId: true } })
    const driverIds = new Map(drivers.map(d => [d.externalId, d.id]))
    let imported = 0

    for (const round of rounds) {
        const race = await prisma.race.findUnique({
            where: { season_round: { season: Number(season), round: Number(round.round) } }
        })
        if (!race || activeSimulations.has(race.id)) continue
        if (!force && race.status === 'COMPLETED') continue

        const quali = qualifying.get(round.round) || new Map()
        const sprint = sprints.get(round.round) || new Map()
        const results = round.Results
            .filter(r => driverIds.has(r.Driver.driverId))
            .map(r => {
                const finished = jolpica.isClassifiedFinish(r.status)
                const s = sprint.get(r.Driver.driverId)
                return {
                    driverId: driverIds.get(r.Driver.driverId),
                    finish_pos: finished ? Number(r.position) : null,
                    dnf: !finished,
                    fastest_lap: r.FastestLap?.rank === '1',
                    quali_pos: quali.get(r.Driver.driverId)?.position ?? null,
                    sprint_pos: s && s.finished ? s.position : null,
                    sprint_dnf: Boolean(s && !s.finished)
                }
            })
        if (!results.length) continue

        await saveRaceResults(race.id, results)
        const laps = Math.max(...round.Results.map(r => Number(r.laps) || 0))
        if (laps) await prisma.race.update({ where: { id: race.id }, data: { totalLaps: laps } })
        imported++

        // Push to every open page so standings and points update the moment results land.
        const snapshot = await buildSnapshot(race.id, null)
        if (snapshot) publishRaceUpdate(race.id, { ...snapshot, resultsJustPublished: true })
        console.log(`[sync] results published for ${race.name}`)
    }
    return imported
}

// Fantasy price of every driver after each finished round, derived from that round's standings
// (same formula as live prices). Each round is fetched once, then kept.
const syncPriceHistory = async (season) => {
    const races = await prisma.race.findMany({
        where: { season: Number(season), status: 'COMPLETED', round: { not: null }, priceSnapshots: { none: {} } },
        orderBy: { round: 'asc' }
    })
    if (!races.length) return
    const drivers = await prisma.driver.findMany({ select: { id: true, externalId: true } })
    const ids = new Map(drivers.map(d => [d.externalId, d.id]))

    for (const race of races) {
        const standings = await jolpica.getRoundDriverStandings(season, race.round)
        const rows = standings
            .filter(s => ids.has(s.Driver.driverId))
            .map(s => ({
                driverId: ids.get(s.Driver.driverId),
                raceId: race.id,
                price: priceFromRank(Number(s.position), Math.max(standings.length, 2), 6, 30)
            }))
        if (rows.length) await prisma.priceSnapshot.createMany({ data: rows, skipDuplicates: true })
    }
}

let running = null

// Full sync of one season. Safe to re-run; serialised so overlapping cron/admin calls don't race.
export const syncSeason = (season = new Date().getUTCFullYear(), { force = false } = {}) => {
    if (running) return running
    running = (async () => {
        const started = Date.now()
        const [driverStandings, constructorStandings, rounds, qualifyingRounds, sprintRounds, grid] = await Promise.all([
            jolpica.getDriverStandings(season),
            jolpica.getConstructorStandings(season),
            jolpica.getSeasonResults(season, 'results'),
            jolpica.getSeasonResults(season, 'qualifying'),
            jolpica.getSeasonResults(season, 'sprint'),
            latestGrid(season)
        ])
        const seats = currentSeats(rounds)
        const allDrivers = await jolpica.getDrivers(season)

        // Team colours come from OpenF1; map them onto Jolpica constructors through current seats.
        const colorsByConstructor = new Map()
        for (const d of allDrivers) {
            const live = grid.get(d.code)
            const cid = seats.get(d.driverId)
            if (live?.team_colour && cid) colorsByConstructor.set(cid, live.team_colour)
        }

        const constructorIds = await syncConstructors(season, constructorStandings, colorsByConstructor)
        await syncDrivers(season, driverStandings, constructorIds, grid, seats, allDrivers)
        try {
            await syncImages()
        } catch (err) {
            console.warn('[sync] image enrichment failed:', err.message)
        }
        const races = await syncCalendar(season)
        const results = await syncResults(season, rounds, {
            force,
            qualifying: positionsByRound(qualifyingRounds),
            sprints: positionsByRound(sprintRounds)
        })
        try {
            await syncPriceHistory(season)
        } catch (err) {
            console.warn('[sync] price history failed:', err.message)
        }

        const summary = { season: Number(season), races, resultsImported: results, ms: Date.now() - started }
        console.log('[sync] done', summary)
        return summary
    })().finally(() => { running = null })
    return running
}
