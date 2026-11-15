/*
 * Integration tests: the real Express app against a real Postgres database.
 * Requires TEST_DATABASE_URL pointing at a database whose name contains "test" (it is wiped).
 * Run `npm run test:db` once to apply migrations to it.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

const url = process.env.TEST_DATABASE_URL
const skip = !url ? 'TEST_DATABASE_URL not set' : !/test/i.test(new URL(url).pathname) ? 'refusing: database name must contain "test"' : false

let base, server, prisma, lockStartedRaces, fx

const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: body && JSON.stringify(body)
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
}

const signUp = async (name) => {
    await call('POST', '/auth/register', { username: name, email: `${name}@test.dev`, password: 'password123', phone_no: `9${String(Math.random()).slice(2, 11)}` })
    const login = await call('POST', '/auth/login', { email: `${name}@test.dev`, password: 'password123' })
    return { token: login.body.accessToken, id: login.body.user.id }
}

const HOUR = 3600_000

before(async () => {
    if (skip) return
    process.env.DATABASE_URL = url
    process.env.JWT_SECRET ??= 'test-secret'
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh'
    process.env.AUTH_RATE_LIMIT = '1000'

    prisma = (await import('../src/config/db.js')).default
    ;({ lockStartedRaces } = await import('../src/jobs/autoLock.js'))
    const { createApp } = await import('../src/app.js')

    // Clean slate.
    const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)

    // Fixtures: 3 teams × 2 drivers + 2 cheap drivers, a finished race and an upcoming one.
    const teams = []
    for (const [i, name] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
        teams.push(await prisma.constructor.create({ data: { name, price: 20 - i * 5, externalId: name.toLowerCase(), teamPrincipal: `TP ${name}` } }))
    }
    const drivers = []
    const prices = [30, 25, 20, 15, 10, 8, 6, 6]
    for (let i = 0; i < 8; i++) {
        drivers.push(await prisma.driver.create({
            data: { name: `Driver ${i + 1}`, code: `D0${i + 1}`, price: prices[i], constructorId: teams[Math.min(Math.floor(i / 2), 2)].id }
        }))
    }
    const now = Date.now()
    const past = await prisma.race.create({ data: { name: 'Past GP', season: 2026, round: 1, raceDate: new Date(now - 72 * HOUR), raceStart: new Date(now - 72 * HOUR), lockAt: new Date(now - 73 * HOUR), status: 'SCHEDULED' } })
    const next = await prisma.race.create({ data: { name: 'Next GP', season: 2026, round: 2, raceDate: new Date(now + 72 * HOUR), raceStart: new Date(now + 72 * HOUR), lockAt: new Date(now + 48 * HOUR) } })
    fx = { teams, drivers, past, next }

    server = createApp().listen(0)
    base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
    server?.close()
    await prisma?.$disconnect()
})

test('auth: register hides the password hash, login works, bad tokens are rejected', { skip }, async () => {
    const reg = await call('POST', '/auth/register', { username: 'hashcheck', email: 'Hash@Test.dev', password: 'password123', phone_no: '9111111111' })
    assert.equal(reg.status, 201)
    assert.ok(!('password' in reg.body))
    assert.equal((await call('POST', '/auth/register', { username: 'weak', email: 'weak@test.dev', password: '123', phone_no: '9111111112' })).status, 400)
    const login = await call('POST', '/auth/login', { email: 'hash@test.dev', password: 'password123' })
    assert.ok(login.body.accessToken)
    assert.equal((await call('GET', '/auth/me', null, 'not-a-token')).status, 401)
    const refreshed = await call('POST', '/auth/refresh', { refreshToken: login.body.refreshToken })
    assert.ok(refreshed.body.accessToken)
})

test('security: users cannot edit others or see private details; admin routes are protected', { skip }, async () => {
    const a = await signUp('sec_a')
    const b = await signUp('sec_b')
    assert.equal((await call('PUT', `/users/${b.id}`, { password: 'hijacked123' }, a.token)).status, 403)
    const profile = await call('GET', `/users/${b.id}`, null, a.token)
    assert.equal(profile.body.email, undefined)
    assert.equal((await call('GET', '/admin/users', null, a.token)).status, 403)
    assert.equal((await call('POST', `/simulation/start/${fx.next.id}`, {}, a.token)).status, 403)
})

test('leagues: private leagues are hidden from non-members, public ones can be joined', { skip }, async () => {
    const owner = await signUp('lg_owner')
    const other = await signUp('lg_other')
    const priv = await call('POST', '/leagues/create', { name: 'Private' }, owner.token)
    assert.equal(priv.status, 201)
    assert.equal((await call('GET', `/leagues/${priv.body.id}`, null, other.token)).status, 404)
    const pub = await call('POST', '/leagues/create', { name: 'Public', league_type: 'PUBLIC' }, owner.token)
    const listed = (await call('GET', '/leagues/public', null, other.token)).body.find(l => l.id === pub.body.id)
    assert.ok(listed.code)
    assert.equal((await call('POST', '/leagues/join', { code: listed.code }, other.token)).status, 200)
    assert.equal((await call('POST', '/leagues/join', { code: listed.code }, other.token)).status, 409)
})

test('teams: budget, captain and lock rules are enforced server-side', { skip }, async () => {
    const p = await signUp('tb_player')
    const league = (await call('POST', '/leagues/create', { name: 'TB' }, p.token)).body
    const d = fx.drivers.map(x => x.id)
    const build = (body) => call('POST', '/teams/build', { raceId: fx.next.id, leagueId: league.id, constructorId: fx.teams[2].id, ...body }, p.token)

    const over = await build({ driverIds: d.slice(0, 5) }) // 30+25+20+15+10 + 10 = 110
    assert.equal(over.status, 400)
    assert.match(over.body.error, /budget/)

    assert.equal((await build({ driverIds: d.slice(3, 8), captainId: d[0] })).status, 400, 'captain must be in the team')

    const ok = await build({
        predictions: d.slice(3, 8).map((driverId, i) => ({ driverId, predictedPosition: i === 0 ? 4 : null })),
        captainId: d[3]
    })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    const mine = (await call('GET', `/teams/${fx.next.id}?leagueId=${league.id}`, null, p.token)).body
    assert.equal(mine.captainId, d[3])
    assert.deepEqual(mine.driverIds, d.slice(3, 8))

    const closed = await call('POST', '/teams/build', { raceId: fx.past.id, leagueId: league.id, driverIds: d.slice(3, 8), constructorId: fx.teams[2].id }, p.token)
    assert.equal(closed.status, 400, 'past the lock time')
})

test('carry-over: a member without a team gets their previous one at lock time', { skip }, async () => {
    const p = await signUp('co_player')
    const league = (await call('POST', '/leagues/create', { name: 'CO' }, p.token)).body
    const d = fx.drivers.map(x => x.id)
    const team = { leagueId: league.id, driverIds: d.slice(3, 8), constructorId: fx.teams[2].id, captainId: d[4] }
    assert.equal((await call('POST', '/teams/build', { raceId: fx.next.id, ...team }, p.token)).status, 200)

    // A later race whose lock has just passed, with no team entered for it.
    const later = await prisma.race.create({
        data: { name: 'Later GP', season: 2026, round: 3, raceDate: new Date(Date.now() + 200 * HOUR), raceStart: new Date(Date.now() + 200 * HOUR), lockAt: new Date(Date.now() - 1000) }
    })
    await lockStartedRaces()
    const carried = await prisma.team.findFirst({ where: { raceId: later.id, userId: p.id }, include: { predictions: true } })
    assert.ok(carried, 'team was carried over')
    assert.equal(carried.carriedOver, true)
    assert.equal(carried.locked, true)
    assert.equal(carried.captainId, d[4])
    assert.deepEqual(carried.predictions.map(x => x.driverId).sort(), d.slice(3, 8).sort())
    await prisma.team.deleteMany({ where: { raceId: later.id } })
    await prisma.race.delete({ where: { id: later.id } })
})

test('results: publishing scores every team (captain, prediction, sprint, qualifying) and pushes to open pages', { skip }, async () => {
    const admin = await signUp('res_admin')
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
    const p = await signUp('res_player')
    const league = (await call('POST', '/leagues/create', { name: 'Scoring' }, p.token)).body
    const d = fx.drivers.map(x => x.id)
    // Enter a team for the past race directly (its lock time has already passed).
    await prisma.team.create({
        data: {
            userId: p.id, raceId: fx.past.id, leagueId: league.id, constructorId: fx.teams[0].id, captainId: d[0],
            predictions: { create: [{ driverId: d[0], predictedPosition: 1 }, { driverId: d[1], predictedPosition: 3 }, ...d.slice(2, 5).map(driverId => ({ driverId }))] }
        }
    })

    // Listen like an open results page.
    const events = []
    const ctrl = new AbortController()
    const listening = fetch(`${base}/races/${fx.past.id}/live`, { signal: ctrl.signal }).then(async res => {
        const reader = res.body.getReader()
        for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            for (const line of new TextDecoder().decode(value).split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)))
        }
    }).catch(() => {})
    await new Promise(r => setTimeout(r, 200))

    const results = d.map((driverId, i) => ({ driverId, finish_pos: i + 1, quali_pos: i + 1, sprint_pos: i + 1 }))
    const saved = await call('PUT', `/results/${fx.past.id}`, { results }, admin.token)
    assert.equal(saved.status, 200, JSON.stringify(saved.body))

    // Driver 1: P1 race 25 + sprint 8 + quali 10 = 43, captain ×2 = 86, exact prediction +5 = 91
    // Driver 2: 18 + 7 + 9 = 34, prediction one off +2 = 36
    // Drivers 3-5: (15+6+8) + (12+5+7) + (10+4+6) = 29 + 24 + 20 = 73
    // Constructor Alpha (drivers 1+2): 43 + 34 = 77
    const lb = (await call('GET', `/leaderboard/${league.id}/race/${fx.past.id}`, null, p.token)).body
    assert.equal(lb[0].total_pts, 91 + 36 + 73 + 77)

    const history = (await call('GET', '/users/me/history', null, p.token)).body
    const entry = history.past.find(e => e.race.id === fx.past.id)
    assert.equal(entry.totalPts, 277)
    assert.equal(entry.drivers.find(x => x.id === d[0]).points, 91)

    const chart = (await call('GET', `/leaderboard/${league.id}/history`, null, p.token)).body
    assert.deepEqual(chart.players.find(x => x.userId === p.id).cumulative, [277])

    const driverPage = (await call('GET', `/drivers/${d[0]}`)).body
    assert.equal(driverPage.results[0].points.total, 43)

    // The results publish path broadcasts through the same stream the sync uses.
    const { publishRaceUpdate } = await import('../src/live/raceEvents.js')
    const { buildSnapshot } = await import('../src/live/raceRunner.js')
    publishRaceUpdate(fx.past.id, { ...(await buildSnapshot(fx.past.id, null)), resultsJustPublished: true })
    await new Promise(r => setTimeout(r, 200))
    ctrl.abort()
    await listening
    assert.ok(events.some(e => e.resultsJustPublished && e.status === 'COMPLETED'))
})

test('simulator refuses real championship races', { skip }, async () => {
    const admin = await signUp('sim_admin')
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
    const res = await call('POST', `/simulation/start/${fx.next.id}`, {}, admin.token)
    assert.equal(res.status, 400)
    assert.match(res.body.error, /test races/)
})

test('push: subscriptions are validated', { skip }, async () => {
    const p = await signUp('push_player')
    assert.ok((await call('GET', '/push/public-key')).body.publicKey)
    assert.equal((await call('POST', '/push/subscribe', { subscription: { endpoint: 'x' } }, p.token)).status, 400)
})
