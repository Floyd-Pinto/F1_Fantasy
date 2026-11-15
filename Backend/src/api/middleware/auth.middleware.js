import jwt from 'jsonwebtoken'
import prisma from '../../config/db.js'
import { JWT_SECRET } from '../../config/auth.js'

const readToken = (req) => {
    const header = req.headers.authorization || ''
    const [scheme, token] = header.split(' ')
    return scheme === 'Bearer' && token ? token : null
}

const loadUser = async (token) => {
    const decoded = jwt.verify(token, JWT_SECRET)
    return prisma.user.findUnique({
        where: { id: Number(decoded.id) },
        select: { id: true, username: true, email: true, phone_no: true, role: true, created_at: true }
    })
}

export const protect = async (req, res, next) => {
    const token = readToken(req)
    if (!token) {
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const user = await loadUser(token)
        if (!user) {
            return res.status(401).json({ error: 'User not found' })
        }
        req.user = user
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' })
    }
    next()
}

export default protect
