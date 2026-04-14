/**
 * Cleanup script: deletes KnowledgeDocument records (and their chunks) that are
 * clearly NOT about the Aura Commodities engagement — newsletters, job alerts, spam.
 *
 * A document is kept if its title or any chunk content mentions:
 *   - "aura" (case-insensitive)
 *   - "marwan"
 *   - "auracommodities"
 *   - "commodities" (in the context of the client)
 *
 * Run with:
 *   cd apps/api && npx tsx src/scripts/cleanup-junk-docs.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Keywords that indicate a document IS relevant to Aura
const KEEP_PATTERNS = [
  /aura/i,
  /marwan/i,
  /auracommodities/i,
]

// Title patterns that are obviously junk regardless of content
const JUNK_TITLE_PATTERNS = [
  /is hiring/i,
  /job alert/i,
  /newsletter/i,
  /unsubscribe/i,
  /pistachio/i,
  /leaving money/i,
  /sunday evening/i,
  /tip #/i,
  /organize.*slice.*dice/i,
  /exclusive Q&A/i,
  /alibaba/i,
  /uber/i,
  /EE reminder/i,
  /software product manager/i,
]

async function main(): Promise<void> {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!user) {
    console.log('No users found.')
    return
  }

  const auraClient = await prisma.client.findFirst({
    where: { name: 'Aura Commodities', userId: user.id },
  })
  if (!auraClient) {
    console.log('Aura Commodities client not found. Run create-aura-client.ts first.')
    return
  }

  const allDocs = await prisma.knowledgeDocument.findMany({
    where: { userId: user.id },
    include: {
      chunks: { select: { content: true }, take: 2 },
    },
  })

  console.log(`Found ${allDocs.length} total documents`)

  const toDelete: string[] = []
  const toKeep: string[] = []

  for (const doc of allDocs) {
    const title = doc.title ?? ''
    const chunkText = doc.chunks.map((c) => c.content).join(' ')
    const combined = `${title} ${chunkText}`

    // Check obvious junk titles first
    const isJunkTitle = JUNK_TITLE_PATTERNS.some((p) => p.test(title))

    // Check if content mentions Aura
    const isAuraRelated = KEEP_PATTERNS.some((p) => p.test(combined))

    if (isAuraRelated && !isJunkTitle) {
      toKeep.push(doc.id)
    } else {
      toDelete.push(doc.id)
      console.log(`  DELETE: "${title}" (id: ${doc.id})`)
    }
  }

  console.log(`\nWill delete ${toDelete.length} documents, keep ${toKeep.length}`)

  if (toDelete.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  // Delete chunks first (cascade should handle it, but be explicit)
  const chunksDeleted = await prisma.documentChunk.deleteMany({
    where: { documentId: { in: toDelete } },
  })

  const docsDeleted = await prisma.knowledgeDocument.deleteMany({
    where: { id: { in: toDelete } },
  })

  console.log(`Deleted ${chunksDeleted.count} chunks and ${docsDeleted.count} documents.`)

  // Make sure remaining docs are linked to Aura
  const linked = await prisma.knowledgeDocument.updateMany({
    where: { userId: user.id, clientId: null },
    data: { clientId: auraClient.id },
  })
  if (linked.count > 0) console.log(`Linked ${linked.count} remaining unlinked docs to Aura.`)

  const remaining = await prisma.knowledgeDocument.count({ where: { userId: user.id } })
  console.log(`\nDone. ${remaining} documents remain.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => void prisma.$disconnect())
