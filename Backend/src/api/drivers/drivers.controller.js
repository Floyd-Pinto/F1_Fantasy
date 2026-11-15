import prisma from '../../config/db.js'
import { parseId, badRequest, toIso } from '../../utils/http.js'
import { weekendPoints } from '../../scoring/scoring.js'
import { optionalNumber, optionalString, isInUse } from '../../utils/crud.js'

const parseDriverInput = (body) => {
    const data = {
        name: optionalString(body.name, 100),
        code: optionalString(body.code, 3)?.toUpperCase(),
        nationality: optionalString(body.nationality, 50),
        headshotUrl: optionalString(body.headshotUrl, 500),
        number: body.number === undefined ? undefined : body.number === null || body.number === '' ? null : optionalNumber(body.number, 'Number'),
        price: optionalNumber(body.price, 'Price'),
        points: optionalNumber(body.points, 'Points'),
        active: body.active === undefined ? undefined : Boolean(body.active),
        constructorId: body.constructorId === undefined ? undefined : body.constructorId === null ? null : parseId(body.constructorId, 'Constructor ID')
    }
    if (data.price !== undefined && data.price <= 0) throw badRequest('Price must be positive')
    return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
}

export const getAllDrivers = async (req, res) => {
    const drivers = await prisma.driver.findMany({
        where: req.query.active === 'true' ? { active: true } : {},
        include: { constructor: true },
        orderBy: [{ active: 'desc' }, { championshipPosition: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }]
    })
    res.json(drivers)
}

// Driver page: profile, every result this season with its fantasy points, and price history.
export const getDriverById = async (req, res) => {
    const id = parseId(req.params.id, 'Driver ID')
    const driver = await prisma.driver.findUnique({
        where: { id },
        include: {
            constructor: true,
            raceResults: { include: { race: { select: { id: true, name: true, season: true, round: true, raceStart: true, status: true } } } },
            priceSnapshots: { include: { race: { select: { id: true, round: true, name: true } } } }
        }
    })
    if (!driver) return res.status(404).json({ error: 'Driver not found' })

    const { raceResults, priceSnapshots, ...profile } = driver
    const results = raceResults
        .filter(r => r.race.status === 'COMPLETED')
        .map(r => {
            const pts = weekendPoints(r)
            return {
                raceId: r.race.id,
                raceName: r.race.name,
                round: r.race.round,
                season: r.race.season,
                raceStart: toIso(r.race.raceStart),
                qualiPosition: r.qualiPosition,
                sprintPosition: r.sprintPosition,
                sprintDnf: r.sprintDnf,
                finishPosition: r.finishPosition,
                dnf: r.dnf,
                fastestLap: r.fastestLap,
                points: pts
            }
        })
        .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))

    const priceHistory = priceSnapshots
        .map(s => ({ round: s.race.round, raceName: s.race.name, price: s.price }))
        .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))

    const finished = results.filter(r => !r.dnf && r.finishPosition)
    res.json({
        ...profile,
        results,
        priceHistory,
        stats: {
            races: results.length,
            fantasyPoints: results.reduce((s, r) => s + r.points.total, 0),
            averageFinish: finished.length ? Math.round((finished.reduce((s, r) => s + r.finishPosition, 0) / finished.length) * 10) / 10 : null,
            podiums: results.filter(r => r.finishPosition && r.finishPosition <= 3).length,
            dnfs: results.filter(r => r.dnf).length
        }
    })
}

export const createDriver = async (req, res) => {
    const data = parseDriverInput(req.body || {})
    if (!data.name) throw badRequest('Driver name is required')
    if (data.constructorId && !(await prisma.constructor.findUnique({ where: { id: data.constructorId } }))) {
        return res.status(404).json({ error: 'Constructor not found' })
    }
    const driver = await prisma.driver.create({ data, include: { constructor: true } })
    res.status(201).json(driver)
}

export const updateDriver = async (req, res) => {
    const id = parseId(req.params.id, 'Driver ID')
    const data = parseDriverInput(req.body || {})

    if (!(await prisma.driver.findUnique({ where: { id } }))) return res.status(404).json({ error: 'Driver not found' })
    if (data.constructorId && !(await prisma.constructor.findUnique({ where: { id: data.constructorId } }))) {
        return res.status(404).json({ error: 'Constructor not found' })
    }

    const driver = await prisma.driver.update({ where: { id }, data, include: { constructor: true } })
    res.json(driver)
}

export const deleteDriver = async (req, res) => {
    const id = parseId(req.params.id, 'Driver ID')
    if (!(await prisma.driver.findUnique({ where: { id } }))) return res.status(404).json({ error: 'Driver not found' })
    try {
        await prisma.driver.delete({ where: { id } })
    } catch (err) {
        if (isInUse(err)) return res.status(409).json({ error: 'Driver is in use — mark them inactive instead' })
        throw err
    }
    res.json({ message: 'Driver deleted successfully' })
}
