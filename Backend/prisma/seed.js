// Seeds the database with the real current F1 season (drivers, teams, calendar, results)
// from free public APIs, and optionally creates an admin account.
//   npm run seed                      -> current season
//   SEED_SEASON=2025 npm run seed     -> another season
//   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_USERNAME -> create or promote an admin
import 'dotenv/config'
import bcrypt from 'bcrypt'
import prisma from '../src/config/db.js'
import { syncSeason } from '../src/services/sync.service.js'

const ensureAdmin = async () => {
    const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase()
    const password = process.env.SEED_ADMIN_PASSWORD
    if (!email || !password) return

    const existing = await prisma.user.findFirst({ where: { email } })
    if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } })
        console.log(`[seed] promoted ${email} to admin`)
        return
    }
    await prisma.user.create({
        data: {
            email,
            username: process.env.SEED_ADMIN_USERNAME || 'admin',
            phone_no: process.env.SEED_ADMIN_PHONE || '0000000000',
            password: await bcrypt.hash(password, 10),
            role: 'ADMIN'
        }
    })
    console.log(`[seed] created admin ${email}`)
}

const main = async () => {
    const season = Number(process.env.SEED_SEASON) || new Date().getUTCFullYear()
    console.log(`[seed] syncing ${season} season from Jolpica-F1 / OpenF1…`)
    const summary = await syncSeason(season)
    const [drivers, teams, races] = await Promise.all([
        prisma.driver.count({ where: { active: true } }),
        prisma.constructor.count(),
        prisma.race.count({ where: { season } })
    ])
    console.log(`[seed] ${drivers} active drivers, ${teams} teams, ${races} races, ${summary.resultsImported} results imported`)
    await ensureAdmin()
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err)
        process.exit(1)
    })
