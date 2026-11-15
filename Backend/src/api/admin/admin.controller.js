import prisma from '../../config/db.js'
import { parseId } from '../../utils/http.js'
import { syncSeason } from '../../services/sync.service.js'

const USER_FIELDS = { id: true, username: true, email: true, role: true, created_at: true }

export const listUsers = async (req, res) => {
    const users = await prisma.user.findMany({
        select: USER_FIELDS,
        orderBy: { created_at: 'desc' }
    })
    res.json(users)
}

const setRole = (role) => async (req, res) => {
    const id = parseId(req.params.userId, 'User ID')

    if (role === 'USER' && id === req.user.id) {
        return res.status(400).json({ error: 'You cannot demote yourself' })
    }

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    const updated = await prisma.user.update({ where: { id }, data: { role }, select: USER_FIELDS })
    res.json({ message: role === 'ADMIN' ? 'User promoted' : 'User demoted', user: updated })
}

export const promoteUser = setRole('ADMIN')
export const demoteUser = setRole('USER')

// One-time bootstrap of the first admin, guarded by ADMIN_BOOT_TOKEN.
// The token is accepted from the body or a header only (never the query string, which ends up in logs).
export const bootAdmin = async (req, res) => {
    const expected = process.env.ADMIN_BOOT_TOKEN
    if (!expected) return res.status(403).json({ error: 'Boot not enabled' })

    const bootToken = req.body?.token || req.headers['x-admin-boot']
    if (!bootToken || bootToken !== expected) return res.status(401).json({ error: 'Invalid boot token' })

    const id = parseId(req.params.userId, 'User ID')

    const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    if (existingAdmin) return res.status(409).json({ error: 'Admin already exists' })

    const updated = await prisma.user.update({ where: { id }, data: { role: 'ADMIN' }, select: USER_FIELDS })
    res.json({ message: 'Bootstrapped admin', user: updated })
}

// Pull real drivers, teams, standings, calendar and results from Jolpica-F1 / OpenF1.
export const syncRealData = async (req, res) => {
    const season = Number(req.body?.season) || new Date().getUTCFullYear()
    const summary = await syncSeason(season, { force: Boolean(req.body?.force) })
    res.json({ message: 'Sync complete', ...summary })
}
