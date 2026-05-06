/**
 * One-time repair: connect all orphaned entity nodes to their Client node
 * and delete true duplicate nodes (same name, different IDs).
 *
 * Run: cd apps/api && npx tsx src/scripts/fix-orphaned-graph-nodes.ts
 */

import { Neo4jClient } from '@axis/knowledge-graph'

const CLIENT_ID = 'cmnusxdd500011i3bf2o327gv'

async function main(): Promise<void> {
  const neo4j = new Neo4jClient()
  if (!neo4j.isAvailable()) {
    console.error('Neo4j unavailable — is Docker running?')
    process.exit(1)
  }

  const prefix = `${CLIENT_ID}_`

  // Step 1: Connect all orphaned entity nodes (zero relationships) to the Client
  console.log('Step 1: Connecting orphaned nodes to Client...')
  const connectResult = await neo4j.write(
    `MATCH (n)
     WHERE n.id STARTS WITH $prefix
       AND NOT (n)-[]-()
     MATCH (client:Client {id: $clientId})
     MERGE (n)-[:PART_OF]->(client)
     RETURN count(n) AS connected`,
    { prefix, clientId: CLIENT_ID }
  )
  const connected = connectResult?.records[0]?.get('connected')
  const connectedCount = typeof connected === 'object' && connected !== null && 'toNumber' in connected
    ? (connected as { toNumber: () => number }).toNumber()
    : Number(connected ?? 0)
  console.log(`  Connected ${connectedCount} orphaned node(s).`)

  // Step 2: List nodes still with zero relationships (diagnostic)
  console.log('\nStep 2: Checking for remaining isolated nodes...')
  const isolatedResult = await neo4j.query(
    `MATCH (n)
     WHERE n.id STARTS WITH $prefix
       AND NOT (n)-[]-()
     RETURN n.name AS name, n.id AS id`,
    { prefix }
  )
  if (isolatedResult && isolatedResult.records.length > 0) {
    console.log(`  ${isolatedResult.records.length} node(s) still isolated (Client node may be missing):`)
    for (const r of isolatedResult.records) {
      console.log(`    - ${String(r.get('name'))} (${String(r.get('id'))})`)
    }
  } else {
    console.log('  None — all nodes connected.')
  }

  // Step 3: Delete true duplicates — same name, keep the one with the lower-sorted ID
  console.log('\nStep 3: Removing duplicate nodes (same name, same client)...')
  const dupeResult = await neo4j.write(
    `MATCH (n)
     WHERE n.id STARTS WITH $prefix
     WITH n.name AS name, n
     ORDER BY n.id
     WITH name, collect(n) AS nodes
     WHERE size(nodes) > 1
     UNWIND nodes[1..] AS dupe
     DETACH DELETE dupe
     RETURN count(dupe) AS deleted`,
    { prefix }
  )
  const deleted = dupeResult?.records[0]?.get('deleted')
  const deletedCount = typeof deleted === 'object' && deleted !== null && 'toNumber' in deleted
    ? (deleted as { toNumber: () => number }).toNumber()
    : Number(deleted ?? 0)
  console.log(`  Deleted ${deletedCount} duplicate node(s).`)

  // Step 4: Summary
  console.log('\nStep 4: Final graph state...')
  const summaryResult = await neo4j.query(
    `MATCH (n) WHERE n.id STARTS WITH $prefix OR n.id = $clientId
     OPTIONAL MATCH (n)-[r]-()
     RETURN count(DISTINCT n) AS nodeCount, count(DISTINCT r) AS relCount`,
    { prefix, clientId: CLIENT_ID }
  )
  if (summaryResult?.records[0]) {
    const r = summaryResult.records[0]
    const toNum = (v: unknown) => typeof v === 'object' && v !== null && 'toNumber' in v
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v ?? 0)
    console.log(`  Nodes: ${toNum(r.get('nodeCount'))} · Relationships: ${toNum(r.get('relCount'))}`)
  }

  await neo4j.close()
  console.log('\nDone. Restart the API and refresh the knowledge graph page.')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
