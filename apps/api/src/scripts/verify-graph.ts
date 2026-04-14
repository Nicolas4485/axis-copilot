import { Neo4jClient } from '@axis/knowledge-graph'
const c = new Neo4jClient()

const people = await c.query('MATCH (n:Person) RETURN n.name AS name, n.role AS role ORDER BY n.name')
console.log('=== PEOPLE ===')
people?.records.forEach((r) => console.log(' ', r.get('name'), '-', r.get('role')))

const rels = await c.query('MATCH ()-[r]->() RETURN type(r) AS t, count(r) AS cnt ORDER BY cnt DESC')
console.log('\n=== RELATIONSHIP TYPES ===')
rels?.records.forEach((r) => {
  const cnt = r.get('cnt')
  console.log(' ', r.get('t'), ':', typeof cnt === 'object' && cnt !== null && 'toNumber' in cnt ? (cnt as { toNumber(): number }).toNumber() : cnt)
})

const total = await c.query('MATCH (n) RETURN count(n) AS nodes')
const totalRels = await c.query('MATCH ()-[r]->() RETURN count(r) AS rels')
console.log('\n=== TOTALS ===')
console.log('Nodes:', total?.records[0]?.get('nodes'))
console.log('Relationships:', totalRels?.records[0]?.get('rels'))

await c.close()
