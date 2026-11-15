// Shared validation for account fields (registration and profile updates).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,50}$/
const PHONE_RE = /^\+?[0-9 ()-]{7,15}$/
export const MIN_PASSWORD_LENGTH = 8

// Returns an error message for the first invalid field, or null. Undefined fields are skipped.
export const validateProfileFields = ({ username, email, phone_no, password }) => {
    if (username !== undefined && !USERNAME_RE.test(username)) {
        return 'Username must be 3-50 characters (letters, numbers, _ . -)'
    }
    if (email !== undefined && !EMAIL_RE.test(email)) {
        return 'Invalid email address'
    }
    if (phone_no !== undefined && !PHONE_RE.test(phone_no)) {
        return 'Invalid phone number'
    }
    if (password !== undefined && (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH)) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    }
    return null
}
