/**
 * One-time fix: merge duplicate Aura Commodities clients.
 * Moves documents/sessions from Client 1 to Client 2, then deletes Client 1.
 *
 * Run with:
 *   cd apps/api && npx tsx src/scripts/merge-aura-clients.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CLIENT_DELETE = 'cmnx7aejw0001rqsgtnv03gsl' // 4 docs, no Neo4j nodes
const CLIENT_KEEP   = 'cmnusxdd500011i3bf2o327gv' // 6 docs, 38 Neo4j nodes

async function main(): Promise<void> {
  // Verify both exist
  const [toDelete, toKeep] = await Promise.all([
    prisma.client.findUnique({ where: { id: CLIENT_DELETE } }),
    prisma.client.findUnique({ where: { id: CLIENT_KEEP } }),
  ])

  if (!toDelete) { console.log('Client to delete not found — already cleaned up?'); return }
  if (!toKeep)   { console.error('Client to keep not found — aborting.'); process.exit(1) }

  console.log(`Merging "${toDelete.name}" (${CLIENT_DELETE}) → "${toKeep.name}" (${CLIENT_KEEP})`)

  // 1. Move documents
  const docs = await prisma.knowledgeDocument.updateMany({
    where: { clientId: CLIENT_DELETE },
    data: { clientId: CLIENT_KEEP },
  })
  console.log(`Moved ${docs.count} documents`)

  // 2. Move sessions
  const sessions = await prisma.session.updateMany({
    where: { clientId: CLIENT_DELETE },
    data: { clientId: CLIENT_KEEP },
  })
  console.log(`Moved ${sessions.count} sessions`)

  // 3. Delete the duplicate client
  await prisma.client.delete({ where: { id: CLIENT_DELETE } })
  console.log(`Deleted duplicate client ${CLIENT_DELETE}`)

  // Verify
  const remaining = await prisma.client.findMany({ where: { name: 'Aura Commodities' } })
  const docCount  = await prisma.knowledgeDocument.count({ where: { clientId: CLIENT_KEEP } })
  console.log(`\nDone. ${remaining.length} Aura Commodities client(s) remain, ${docCount} documents linked.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => void prisma.$disconnect())
