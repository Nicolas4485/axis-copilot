/**
 * fix-nexus-docs.ts — rename anonymous doc on Nexus DataOps deal and show all deal docs
 * Run: cd apps/api && npx tsx src/scripts/fix-nexus-docs.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Find the Nexus deal
  const deal = await prisma.deal.findFirst({
    where: { name: { contains: 'Nexus', mode: 'insensitive' } },
    select: { id: true, name: true, clientId: true },
  })

  if (!deal) {
    console.error('❌ No Nexus deal found')
    process.exit(1)
  }

  console.log(`🔍 Found deal: ${deal.name} (${deal.id})\n`)

  // List all documents on this deal
  const docs = await prisma.knowledgeDocument.findMany({
    where: { dealId: deal.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, docType: true, chunkCount: true, createdAt: true, conflictNotes: true },
  })

  console.log(`📄 Documents on deal (${docs.length} total):`)
  for (const doc of docs) {
    const isStub = doc.conflictNotes?.includes('[DEMO STUB]')
    console.log(`  - "${doc.title}" | type=${doc.docType} | chunks=${doc.chunkCount} | stub=${isStub} | id=${doc.id}`)
  }

  // Find and rename the anonymous doc
  const anonDoc = docs.find(
    (d) => !d.title || d.title === 'anonymous' || d.title === 'Unknown Document' || d.title?.toLowerCase().includes('anon')
  )

  if (!anonDoc) {
    console.log('\n✅ No anonymous document found — nothing to rename.')
  } else {
    const newTitle = 'Nexus DataOps — Confidential Information Memorandum (2024)'
    await prisma.knowledgeDocument.update({
      where: { id: anonDoc.id },
      data: { title: newTitle },
    })
    console.log(`\n✅ Renamed "${anonDoc.title}" → "${newTitle}"`)
  }

  // Also check all docs where title is missing/null across the whole DB
  const allAnon = await prisma.knowledgeDocument.findMany({
    where: {
      OR: [
        { title: '' },
        { title: 'anonymous' },
        { title: 'Unknown Document' },
      ],
    },
    select: { id: true, title: true, dealId: true, clientId: true, createdAt: true },
  })

  if (allAnon.length > 0) {
    console.log(`\n⚠️  Other anonymous documents in DB (${allAnon.length}):`)
    for (const d of allAnon) {
      console.log(`  - id=${d.id} | dealId=${d.dealId} | created=${d.createdAt.toISOString().slice(0, 10)}`)
    }
  }
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
