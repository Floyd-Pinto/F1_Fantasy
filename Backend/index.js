import 'dotenv/config'
import { createApp } from './src/app.js'
import { startAutoLockJob } from './src/jobs/autoLock.js'
import { startRealDataJobs, startReminderJob } from './src/jobs/realData.js'
import { recoverInterruptedRaces } from './src/live/raceRunner.js'

const PORT = Number(process.env.PORT) || 4000

createApp().listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`)
    try {
        await recoverInterruptedRaces()
    } catch (err) {
        console.error('[startup] could not recover interrupted races:', err.message)
    }
    startAutoLockJob()
    startReminderJob()
    startRealDataJobs()
})
