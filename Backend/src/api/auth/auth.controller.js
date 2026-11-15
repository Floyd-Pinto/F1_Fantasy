import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import prisma from '../../config/db.js'
import { JWT_SECRET, JWT_REFRESH_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '../../config/auth.js'
import { publicUser } from '../../utils/http.js'
import { validateProfileFields } from '../../utils/validation.js'

// Real hash of a random string, used so failed logins for unknown emails cost the same as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync(Math.random().toString(36), 10)

const signAccessToken = (user) => jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL })
const signRefreshToken = (user) => jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL })

export const register = async (req, res) => {
    const username = req.body?.username?.trim()
    const email = req.body?.email?.trim().toLowerCase()
    const phone_no = req.body?.phone_no?.trim()
    const password = req.body?.password

    if (!username || !email || !password || !phone_no) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    const invalid = validateProfileFields({ username, email, phone_no, password })
    if (invalid) return res.status(400).json({ error: invalid })

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [
                { email: { equals: email, mode: 'insensitive' } },
                { username },
                { phone_no }
            ]
        }
    })

    if (existingUser) {
        return res.status(409).json({ error: 'Username, email or phone number already registered' })
    }

    const user = await prisma.user.create({
        data: { username, email, password: await bcrypt.hash(password, 10), phone_no }
    })

    res.status(201).json(publicUser(user))
}

export const login = async (req, res) => {
    const email = req.body?.email?.trim()
    const password = req.body?.password

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' })
    }

    const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } }
    })

    // Compare even when the user is missing so response timing doesn't reveal which emails exist.
    const valid = await bcrypt.compare(String(password), user?.password || DUMMY_HASH)

    if (!user || !valid) {
        return res.status(401).json({ error: 'Invalid credentials' })
    }

    res.json({
        message: 'Login successful',
        user: { id: user.id, username: user.username, email: user.email, role: user.role },
        accessToken: signAccessToken(user),
        refreshToken: signRefreshToken(user)
    })
}

export const getMe = async (req, res) => {
    res.json({ user: req.user })
}

// Tokens are stateless; the client discards them.
export const logout = async (req, res) => {
    res.json({ message: 'Logout successful' })
}

export const refresh = async (req, res) => {
    const { refreshToken } = req.body || {}

    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' })
    }

    let decoded
    try {
        decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET)
    } catch {
        return res.status(401).json({ error: 'Invalid refresh token' })
    }

    const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) } })
    if (!user) {
        return res.status(401).json({ error: 'Invalid refresh token' })
    }

    res.json({
        accessToken: signAccessToken(user),
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
    })
}
