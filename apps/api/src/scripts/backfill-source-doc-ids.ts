/**
 * Backfill sourceDocIds on Neo4j entity nodes by matching entity names
 * against knowledge document chunks in Prisma.
 *
 * For each entity node with sourceDocIds=[], search all chunk text for the
 * entity's name (case-insensitive). Collect unique documentIds and write
 * them back to the Neo4j node.
 *
 * Run: npx tsx src/scripts/backfill-source-doc-ids.ts
 */

import { PrismaClient } from '@prisma/client'
import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'

const CLIENT_ID = 'cmnusxdd500011i3bf2o327gv'

const prisma    = new PrismaClient()
const neo4j     = new Neo4jClient()
const graphOps  = new GraphOperations(neo4j)

// ── 1. Load all entity nodes for this client from Neo4j ────────────────────
const subgraph = await graphOps.getClientSubgraph(CLIENT_ID)
if (!subgraph) {
  console.error('Could not load subgraph — is Neo4j running?')
  process.exit(1)
}

const entities = subgraph.nodes.filter(
  (n) => 'label' in n && (n as { label: string }).label !== 'Client'
)
console.log(`Loaded ${entities.length} entity nodes from Neo4j`)

// ── 2. Load all chunks for this client from Prisma ─────────────────────────
const docs = await prisma.knowledgeDocument.findMany({
  where: { clientId: CLIENT_ID },
  select: { id: true, title: true },
})

const chunks = await prisma.documentChunk.findMany({
  where: { document: { clientId: CLIENT_ID } },
  select: { id: true, content: true, documentId: true },
})

console.log(`Loaded ${chunks.length} chunks across ${docs.length} documents`)

// ── 3. For each entity, find which documents mention it ────────────────────
let updatedCount = 0

for (const entity of entities) {
  const name = entity.name?.trim()
  if (!name || name.length < 3) continue

  const nameRegex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

  const matchingDocIds = [
    ...new Set(
      chunks
        .filter((c) => nameRegex.test(c.content))
        .map((c) => c.documentId)
    ),
  ]

  if (matchingDocIds.length === 0) continue

  // Write back to Neo4j
  const label = ('label' in entity ? (entity as { label: string }).label : 'Concept') as Parameters<typeof graphOps.upsertNode>[0]
  await graphOps.upsertNode(label, {
    id:           entity.id,
    name:         entity.name,
    sourceDocIds: matchingDocIds,
  })

  const titles = matchingDocIds
    .map((id) => docs.find((d) => d.id === id)?.title ?? id)
    .join(', ')

  console.log(`  ✓ ${name} (${label}) → ${matchingDocIds.length} doc(s): ${titles}`)
  updatedCount++
}

console.log(`\nDone — updated ${updatedCount} / ${entities.length} entities with source doc IDs`)

await prisma.$disconnect()
await neo4j.close()
