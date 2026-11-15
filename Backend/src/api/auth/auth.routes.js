import express from 'express'
import rateLimit from 'express-rate-limit'
import { register, login, getMe, logout, refresh } from './auth.controller.js'
import { protect } from '../middleware/auth.middleware.js'

const router = express.Router()

// Slow down credential stuffing / signup spam.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again later' }
})

router.post('/register', authLimiter, register)
router.post('/login', authLimiter, login)
router.get('/me', protect, getMe)
router.post('/logout', logout)
router.post('/refresh', refresh)

export default router
