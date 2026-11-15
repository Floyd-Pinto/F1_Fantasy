import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
        seed: 'node prisma/seed.js'
    },
    datasource: {
        // Placeholder lets `prisma generate` run during install before DATABASE_URL is configured.
        url: process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder'
    }
})
