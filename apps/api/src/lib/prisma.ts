import { PrismaClient } from '@prisma/client'

// Single shared PrismaClient instance — prevents connection pool exhaustion in dev
// (tsx reloads the module on change, but globalThis persists across hot reloads).
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}
