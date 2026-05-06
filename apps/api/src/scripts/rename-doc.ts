/**
 * Rename a document by partial title match.
 *
 * Usage:
 *   cd apps/api && npx tsx src/scripts/rename-doc.ts "anonymous" "Nexus DataOps — Confidential Information Memorandum (2024)"
 *   cd apps/api && npx tsx src/scripts/rename-doc.ts "cim nexus" "Nexus DataOps — Confidential Information Memorandum (2024)"
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const [, , search, newTitle] = process.argv

  if (!search || !newTitle) {
    console.error('Usage: npx tsx rename-doc.ts "<search>" "<new title>"')
    process.exit(1)
  }

  const docs = await prisma.knowledgeDocument.findMany({
    where: { title: { contains: search, mode: 'insensitive' } },
    select: { id: true, title: true, clientId: true },
  })

  if (docs.length === 0) {
    console.error(`❌ No documents found matching "${search}"`)
    process.exit(1)
  }

  if (docs.length > 1) {
    console.log(`Found ${docs.length} matches — renaming all:`)
    docs.forEach((d) => console.log(`   - ${d.title} (${d.id})`))
  }

  for (const doc of docs) {
    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { title: newTitle },
    })
    console.log(`✅ Renamed: "${doc.title}" → "${newTitle}"`)
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('❌ Failed:', err)
  prisma.$disconnect().catch(() => undefined)
  process.exit(1)
})
