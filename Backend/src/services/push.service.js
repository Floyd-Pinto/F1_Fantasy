import webpush from 'web-push'
import prisma from '../config/db.js'
import { badRequest } from '../utils/http.js'

/*
 * Web Push (free, no third-party service): the server signs notifications with VAPID keys and the
 * browser's push service delivers them, even when the site isn't open.
 * Keys come from env, or are generated once and stored in AppSetting so subscriptions stay valid.
 */
let ready = null

const loadKeys = async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    }
    const stored = await prisma.appSetting.findUnique({ where: { key: 'vapid' } })
    if (stored) return JSON.parse(stored.value)

    const keys = webpush.generateVAPIDKeys()
    await prisma.appSetting.upsert({
        where: { key: 'vapid' },
        update: {},
        create: { key: 'vapid', value: JSON.stringify(keys) }
    })
    // Re-read in case another process won the race to create them.
    return JSON.parse((await prisma.appSetting.findUnique({ where: { key: 'vapid' } })).value)
}

export const getVapidKeys = () => {
    ready ??= loadKeys().then(keys => {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@f1-fantasy.local', keys.publicKey, keys.privateKey)
        return keys
    })
    return ready
}

export const saveSubscription = async (userId, subscription) => {
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        throw badRequest('Invalid push subscription')
    }
    await prisma.pushSubscription.upsert({
        where: { endpoint: subscription.endpoint },
        update: { userId, keys: subscription.keys },
        create: { userId, endpoint: subscription.endpoint, keys: subscription.keys }
    })
}

export const removeSubscription = (userId, endpoint) =>
    prisma.pushSubscription.deleteMany({ where: { userId, endpoint } })

// Send to every device a user has subscribed. Dead subscriptions (404/410) are cleaned up.
export const sendToUser = async (userId, payload) => {
    await getVapidKeys()
    const subs = await prisma.pushSubscription.findMany({ where: { userId } })
    let sent = 0
    for (const sub of subs) {
        try {
            await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 3600 })
            sent++
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
                await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
            } else {
                console.warn(`[push] send failed (${err.statusCode || err.message})`)
            }
        }
    }
    return sent
}

const REMIND_BEFORE_MS = 60 * 60 * 1000

// About an hour before lock, nudge subscribed players who haven't picked a team in every league.
export const sendLockReminders = async () => {
    const now = Date.now()
    const races = await prisma.race.findMany({
        where: { status: 'SCHEDULED', reminderSent: false, lockAt: { gt: new Date(now), lte: new Date(now + REMIND_BEFORE_MS) } }
    })
    for (const race of races) {
        const subscribers = await prisma.user.findMany({
            where: { pushSubscriptions: { some: {} } },
            include: { memberships: { include: { league: { select: { id: true, name: true } } } }, teams: { where: { raceId: race.id }, select: { leagueId: true } } }
        })
        const minutes = Math.round((race.lockAt.getTime() - now) / 60_000)
        for (const user of subscribers) {
            const entered = new Set(user.teams.map(t => t.leagueId))
            const missing = user.memberships.map(m => m.league).filter(l => !entered.has(l.id))
            if (!missing.length) continue
            const first = missing[0]
            await sendToUser(user.id, {
                title: `${race.name}: teams lock in ${minutes} min`,
                body: missing.length === 1
                    ? `You haven't picked a team in ${first.name} yet. Otherwise your last team carries over.`
                    : `You haven't picked a team in ${missing.length} leagues yet. Otherwise your last teams carry over.`,
                url: `/league/${first.id}/race/${race.id}/team-builder`
            })
        }
        await prisma.race.update({ where: { id: race.id }, data: { reminderSent: true } })
        console.log(`[push] lock reminders sent for ${race.name}`)
    }
}
