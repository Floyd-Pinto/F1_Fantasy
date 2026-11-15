import { badRequest } from './http.js'

export const optionalNumber = (value, field) => {
    if (value === undefined) return undefined
    const n = Number(value)
    if (!Number.isFinite(n)) throw badRequest(`${field} must be a number`)
    return n
}

export const optionalString = (value, max) => {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    const s = String(value).trim()
    if (s.length > max) throw badRequest(`Value must be ${max} characters or fewer`)
    return s
}

// Prisma P2003 = foreign key violation: the row is still referenced (e.g. by fantasy teams).
export const isInUse = (err) => err?.code === 'P2003'
