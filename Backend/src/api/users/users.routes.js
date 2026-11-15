import express from 'express'
import { getAllUsers, getUserById, updateUserProfile, deleteUser, getMyHistory } from './users.controller.js'
import { protect } from '../middleware/auth.middleware.js'
import { isAdmin } from '../middleware/admin.middleware.js'

const router = express.Router()

router.use(protect)

router.get('/', isAdmin, getAllUsers)
router.get('/me/history', getMyHistory)
router.get('/:id', getUserById)
router.put('/:id', updateUserProfile)
router.delete('/:id', isAdmin, deleteUser)

export default router
