import { Neo4jClient } from '@axis/knowledge-graph'
const c = new Neo4jClient()
const r = await c.query('MATCH (n) WHERE n.name IS NOT NULL RETURN n.name AS name, labels(n) AS labels, n.id AS id ORDER BY labels(n)[0], n.name')
if (r) {
  r.records.forEach((rec) => {
    const labels = rec.get('labels') as string[]
    const name = rec.get('name') as string
    const id = rec.get('id') as string
    console.log(`${labels[0]}: ${name}  [${id}]`)
  })
  console.log(`\nTotal: ${r.records.length} nodes`)
} else {
  console.log('No result / Neo4j unavailable')
}
await c.close()
