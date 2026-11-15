export const isAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' })
    }
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' })
    }
    next()
}

export default isAdmin
