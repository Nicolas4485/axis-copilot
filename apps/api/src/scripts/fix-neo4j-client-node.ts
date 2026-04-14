/**
 * One-time fix: create the Aura Commodities Client node in Neo4j and
 * connect all extracted entity nodes to it with RELATES_TO relationships.
 *
 * The backfill script stored 47 entity nodes but never created the Client
 * anchor node. getClientSubgraph() starts from MATCH (client:Client {id: $clientId}),
 * so without this node the subgraph returns nothing.
 *
 * Run with:
 *   cd apps/api && npx tsx src/scripts/fix-neo4j-client-node.ts
 */

import { PrismaClient } from '@prisma/client'
import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const auraClient = await prisma.client.findFirst({
    where: { name: 'Aura Commodities' },
    orderBy: { createdAt: 'asc' }, // Use the original client (oldest), which was used for backfill
  })
  if (!auraClient) {
    console.error('Aura Commodities client not found in Postgres.')
    process.exit(1)
  }
  console.log(`Aura Commodities: ${auraClient.id}`)

  const neo4j = new Neo4jClient()
  if (!neo4j.isAvailable()) {
    console.error('Neo4j not available. Check NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD.')
    process.exit(1)
  }
  const graphOps = new GraphOperations(neo4j)

  // 1. Upsert the Client node
  await graphOps.upsertNode('Client', {
    id: auraClient.id,
    name: auraClient.name,
    sourceDocIds: [],
  })
  console.log(`Created/updated Client node: ${auraClient.name} (${auraClient.id})`)

  // 2. Find all nodes whose ID starts with the clientId prefix (the backfill naming convention)
  const prefix = `${auraClient.id}_`
  const findResult = await neo4j.query(
    `MATCH (n) WHERE n.id STARTS WITH $prefix AND NOT n:Client RETURN n.id AS nodeId`,
    { prefix }
  )
  if (!findResult) {
    console.log('No entity nodes found with that prefix — nothing to link.')
    await neo4j.close()
    return
  }

  const nodeIds: string[] = findResult.records.map((r) => r.get('nodeId') as string)
  console.log(`Found ${nodeIds.length} entity nodes to link to client`)

  // 3. Create RELATES_TO relationships from each entity to the Client node
  let linked = 0
  for (const nodeId of nodeIds) {
    await neo4j.write(
      `MATCH (entity {id: $nodeId}), (client:Client {id: $clientId})
       MERGE (entity)-[:RELATES_TO]->(client)`,
      { nodeId, clientId: auraClient.id }
    )
    linked++
  }
  console.log(`Linked ${linked} entity nodes to Client`)

  await neo4j.close()
  console.log('\nDone. Run: GET /api/knowledge/graph/' + auraClient.id)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => void prisma.$disconnect())
