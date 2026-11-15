import prisma from '../../config/db.js'
import { parseId, badRequest } from '../../utils/http.js'
import { optionalNumber, optionalString, isInUse } from '../../utils/crud.js'

const parseConstructorInput = (body) => {
    const data = {
        name: optionalString(body.name, 100),
        nationality: optionalString(body.nationality, 50),
        teamPrincipal: optionalString(body.teamPrincipal, 100),
        color: optionalString(body.color, 7)?.replace(/^#/, ''),
        logoUrl: optionalString(body.logoUrl, 500),
        price: optionalNumber(body.price, 'Price'),
        points: optionalNumber(body.points, 'Points'),
        active: body.active === undefined ? undefined : Boolean(body.active)
    }
    if (data.color && !/^[0-9a-fA-F]{6}$/.test(data.color)) throw badRequest('Color must be a 6-digit hex value')
    if (data.logoUrl && !/^https:\/\//.test(data.logoUrl)) throw badRequest('Logo URL must start with https://')
    if (data.price !== undefined && data.price <= 0) throw badRequest('Price must be positive')
    return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
}

export const getAllConstructors = async (req, res) => {
    const constructors = await prisma.constructor.findMany({
        where: req.query.active === 'true' ? { active: true } : {},
        include: { drivers: { where: { active: true }, orderBy: { championshipPosition: { sort: 'asc', nulls: 'last' } } } },
        orderBy: [{ championshipPosition: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }]
    })
    res.json(constructors)
}

export const getConstructorById = async (req, res) => {
    const id = parseId(req.params.id, 'Constructor ID')
    const constructor = await prisma.constructor.findUnique({ where: { id }, include: { drivers: true } })
    if (!constructor) return res.status(404).json({ error: 'Constructor not found' })
    res.json(constructor)
}

export const createConstructor = async (req, res) => {
    const data = parseConstructorInput(req.body || {})
    if (!data.name) throw badRequest('Constructor name is required')
    const constructor = await prisma.constructor.create({ data, include: { drivers: true } })
    res.status(201).json(constructor)
}

export const updateConstructor = async (req, res) => {
    const id = parseId(req.params.id, 'Constructor ID')
    const data = parseConstructorInput(req.body || {})
    if (!(await prisma.constructor.findUnique({ where: { id } }))) return res.status(404).json({ error: 'Constructor not found' })
    const constructor = await prisma.constructor.update({ where: { id }, data, include: { drivers: true } })
    res.json(constructor)
}

export const deleteConstructor = async (req, res) => {
    const id = parseId(req.params.id, 'Constructor ID')
    if (!(await prisma.constructor.findUnique({ where: { id } }))) return res.status(404).json({ error: 'Constructor not found' })
    try {
        await prisma.$transaction([
            prisma.driver.updateMany({ where: { constructorId: id }, data: { constructorId: null } }),
            prisma.constructor.delete({ where: { id } })
        ])
    } catch (err) {
        if (isInUse(err)) return res.status(409).json({ error: 'Constructor is used by fantasy teams — mark it inactive instead' })
        throw err
    }
    res.json({ message: 'Constructor deleted successfully' })
}
