/**
 * Removes all [DEMO STUB] KnowledgeDocument records that were seeded
 * without real content. Run after uploading real PDFs through the VDR.
 *
 * Run:
 *   cd apps/api && npx tsx src/scripts/cleanup-stubs.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🧹 Cleaning up demo stub documents...\n')

  const stubs = await prisma.knowledgeDocument.findMany({
    where: { conflictNotes: { contains: '[DEMO STUB]' } },
    select: { id: true, title: true, clientId: true },
  })

  if (stubs.length === 0) {
    console.log('✅ No stub documents found — nothing to clean up.')
    await prisma.$disconnect()
    return
  }

  console.log(`Found ${stubs.length} stub documents:`)
  for (const doc of stubs) {
    console.log(`   - ${doc.title} (${doc.id})`)
  }

  await prisma.knowledgeDocument.deleteMany({
    where: { conflictNotes: { contains: '[DEMO STUB]' } },
  })

  console.log(`\n✅ Deleted ${stubs.length} stub documents.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('❌ Failed:', err)
  prisma.$disconnect().catch(() => undefined)
  process.exit(1)
})
