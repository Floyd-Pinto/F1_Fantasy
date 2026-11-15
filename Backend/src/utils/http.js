// Error type for request validation failures; the global error handler maps it to a 4xx.
export class HttpError extends Error {
    constructor(status, message) {
        super(message)
        this.status = status
    }
}

export const httpError = (status, message) => new HttpError(status, message)
export const badRequest = (message) => new HttpError(400, message)

export const parseId = (value, fieldName = 'ID') => {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) {
        throw badRequest(`${fieldName} must be a valid ID`)
    }
    return id
}

// Strip secrets before sending a user record to a client.
export const publicUser = (user) => {
    if (!user) return null
    const { password: _password, ...rest } = user
    return rest
}

// Prisma 7 can return DateTimes from nested relation queries as { $type: 'DateTime', value };
// normalise either form to an ISO string.
export const toIso = (v) => (v instanceof Date ? v.toISOString() : v?.$type === 'DateTime' ? new Date(v.value).toISOString() : v ?? null)
