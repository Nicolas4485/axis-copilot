/**
 * One-time fix: reassign the Aura Commodities client and its documents
 * to the sakrnicolas@gmail.com user so the dev auto-login can access them.
 *
 * Run with:
 *   cd apps/api && npx tsx src/scripts/fix-user-ownership.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  // The user returned by dev auto-login
  const targetUser = await prisma.user.findFirst({
    where: { email: 'sakrnicolas@gmail.com' },
  })
  if (!targetUser) {
    console.error('sakrnicolas@gmail.com not found — are you logged in via the dev auto-login?')
    process.exit(1)
  }
  console.log(`Target user: ${targetUser.email} (${targetUser.id})`)

  // Find the Aura Commodities client regardless of current owner
  const auraClient = await prisma.client.findFirst({
    where: { name: 'Aura Commodities' },
  })
  if (!auraClient) {
    console.error('Aura Commodities client not found.')
    process.exit(1)
  }
  console.log(`Aura Commodities client: ${auraClient.id} (currently owned by userId: ${auraClient.userId})`)

  if (auraClient.userId === targetUser.id) {
    console.log('Already owned by the target user — nothing to do.')
    return
  }

  // Reassign client
  await prisma.client.update({
    where: { id: auraClient.id },
    data: { userId: targetUser.id },
  })
  console.log(`Reassigned client to ${targetUser.email}`)

  // Reassign all documents belonging to the old owner that are linked to this client
  const docsUpdated = await prisma.knowledgeDocument.updateMany({
    where: { clientId: auraClient.id },
    data: { userId: targetUser.id },
  })
  console.log(`Reassigned ${docsUpdated.count} documents`)

  console.log('\nDone. The knowledge graph API should now return results for this client.')
  console.log(`Client ID to use: ${auraClient.id}`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => void prisma.$disconnect())
