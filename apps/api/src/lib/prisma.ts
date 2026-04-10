import { PrismaClient } from '@prisma/client'

// Single shared PrismaClient instance — prevents connection pool exhaustion in dev
// (tsx reloads the module on change, but globalThis persists across hot reloads).
//
// Connection pool sizing: set DATABASE_URL with ?connection_limit=20&pool_timeout=30
// in production to handle concurrent AI requests (each spawns 4-8 DB queries).
// Prisma default pool is 10 — too small under concurrent agentic load.
// Example: postgresql://user:pass@host/db?connection_limit=20&pool_timeout=30
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        // Respect DATABASE_URL with pool params already embedded; also accept
        // PRISMA_POOL_TIMEOUT and PRISMA_POOL_SIZE overrides for environments
        // where the DATABASE_URL can't be modified (e.g., PaaS secrets).
        url: (() => {
          const base = process.env['DATABASE_URL'] ?? ''
          const poolTimeout = process.env['PRISMA_POOL_TIMEOUT']
          const poolSize = process.env['PRISMA_POOL_SIZE']
          if (!poolTimeout && !poolSize) return base

          try {
            const url = new URL(base)
            if (poolSize && !url.searchParams.has('connection_limit')) {
              url.searchParams.set('connection_limit', poolSize)
            }
            if (poolTimeout && !url.searchParams.has('pool_timeout')) {
              url.searchParams.set('pool_timeout', poolTimeout)
            }
            return url.toString()
          } catch {
            return base
          }
        })(),
      },
    },
  })

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}
