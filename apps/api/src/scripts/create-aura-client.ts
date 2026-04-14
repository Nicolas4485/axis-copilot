/**
 * One-time script: creates the "Aura Commodities" client and links all
 * unlinked documents (clientId = null) to it.
 *
 * Run with:
 *   cd apps/api && npx tsx src/scripts/create-aura-client.ts
 */

import { PrismaClient } from '@prisma/client'

// Run with: cd apps/api && node --env-file=../../.env --import tsx/esm src/scripts/create-aura-client.ts
// Or: DATABASE_URL="..." npx tsx src/scripts/create-aura-client.ts

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
  })

  if (!user) {
    console.log('No users found. Start the API in dev mode first so the dev user is auto-created.')
    return
  }

  console.log(`Using user: ${user.email} (${user.id})`)

  let client = await prisma.client.findFirst({
    where: { name: 'Aura Commodities', userId: user.id },
  })

  if (!client) {
    client = await prisma.client.create({
      data: {
        userId: user.id,
        name: 'Aura Commodities',
        industry: 'Commodities Trading',
      },
    })
    console.log(`Created client "Aura Commodities" (${client.id})`)
  } else {
    console.log(`Client "Aura Commodities" already exists (${client.id})`)
  }

  // Link unlinked documents for this user
  const unlinked = await prisma.knowledgeDocument.updateMany({
    where: { userId: user.id, clientId: null },
    data: { clientId: client.id },
  })
  console.log(`Linked ${unlinked.count} unlinked document(s) to Aura Commodities`)

  const total = await prisma.knowledgeDocument.count({
    where: { clientId: client.id },
  })
  console.log(`Total documents linked to Aura Commodities: ${total}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
