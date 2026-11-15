import 'dotenv/config'

const isProd = process.env.NODE_ENV === 'production'

const readSecret = (name, devFallback) => {
    const value = process.env[name]
    if (value) return value
    if (isProd) {
        throw new Error(`${name} must be set in production`)
    }
    console.warn(`[config] ${name} not set — using an insecure development fallback`)
    return devFallback
}

export const JWT_SECRET = readSecret('JWT_SECRET', 'dev-only-access-secret')
export const JWT_REFRESH_SECRET = readSecret('JWT_REFRESH_SECRET', 'dev-only-refresh-secret')

export const ACCESS_TOKEN_TTL = '1h'
export const REFRESH_TOKEN_TTL = '7d'
