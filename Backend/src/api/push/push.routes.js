import express from 'express'
import { protect } from '../middleware/auth.middleware.js'
import { getVapidKeys, saveSubscription, removeSubscription, sendToUser } from '../../services/push.service.js'

const router = express.Router()

router.get('/public-key', async (req, res) => {
    res.json({ publicKey: (await getVapidKeys()).publicKey })
})

router.post('/subscribe', protect, async (req, res) => {
    await saveSubscription(req.user.id, req.body?.subscription)
    res.status(201).json({ message: 'Subscribed to lock reminders' })
})

router.post('/unsubscribe', protect, async (req, res) => {
    await removeSubscription(req.user.id, req.body?.endpoint)
    res.json({ message: 'Unsubscribed' })
})

router.post('/test', protect, async (req, res) => {
    const sent = await sendToUser(req.user.id, {
        title: 'F1 Fantasy reminders are on',
        body: "You'll get a nudge about an hour before teams lock each race weekend.",
        url: '/races'
    })
    res.json({ sent })
})

export default router
