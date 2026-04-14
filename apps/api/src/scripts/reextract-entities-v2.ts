/**
 * v2 entity extraction — two-pass, semantic relationships.
 *
 * Pass 1: Extract all named entities from all chunks (deduplicated)
 * Pass 2: For each chunk, extract typed relationships between co-occurring entities
 * Also: Hard-codes the known people from emails (Paul Khoury, Sean Hannah, Jack Wade)
 *
 * Run with:
 *   cd apps/api && npx tsx src/scripts/reextract-entities-v2.ts
 */

import { PrismaClient } from '@prisma/client'
import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'
import type { NodeLabel } from '@axis/knowledge-graph'

const CLIENT_ID = 'cmnusxdd500011i3bf2o327gv'
const CLIENT_NAME = 'Aura Commodities'

const prisma = new PrismaClient()

// ─── Types ──────────────────────────────────────────────────────────────────

interface Entity {
  name: string
  type: 'Person' | 'Organization' | 'Product' | 'Technology' | 'Process' | 'Concept' | 'Competitor' | 'Industry'
  role?: string
  confidence: number
}

interface Relationship {
  from: string
  to: string
  type: string
  confidence: number
}

interface AnthropicMessage {
  type: string
  text?: string
}

// ─── Anthropic helper ────────────────────────────────────────────────────────

async function callClaude(prompt: string, apiKey: string, maxTokens = 2048): Promise<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Anthropic ${resp.status}: ${err.slice(0, 200)}`)
  }
  const data = await resp.json() as { content: AnthropicMessage[] }
  return data.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}

function parseJson<T>(raw: string): T | null {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match?.[0]) return null
  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}

// ─── Pass 1: Entity extraction ───────────────────────────────────────────────

async function extractEntities(text: string, apiKey: string): Promise<Entity[]> {
  const prompt = `You are extracting named entities from documents about ${CLIENT_NAME}, a commodities trading intelligence platform.

Extract ONLY entities that are clearly mentioned. Use these types STRICTLY:
- Person: individual people (employees, consultants, executives)
- Organization: companies or organisations (NOT Aura Commodities itself — that is the client)
- Product: software products, platforms, or tools built by Aura
- Technology: external technologies, data feeds, weather models, analytics tools
- Process: business processes, product features, workflows
- Concept: abstract domain concepts (weather phenomena, market concepts)
- Competitor: competing companies or alternative products
- Industry: market sectors or customer segments

IMPORTANT RULES:
- "Aura Commodities" is the CLIENT — do NOT extract it as an entity here
- Nicolas Sakr is a Person (external consultant), NOT an Organization
- Marwan Meroue is a Person (CEO), NOT an Organization
- "Granola" is a Technology (meeting notes tool)
- Do NOT extract generic words like "users", "customers", "team"
- Minimum confidence 0.75

Return a JSON array ONLY, no prose:
[{"name": "...", "type": "Person|Organization|Product|Technology|Process|Concept|Competitor|Industry", "role": "optional role/description", "confidence": 0.0-1.0}]

Text:
${text.slice(0, 4000)}

JSON array:`

  try {
    const raw = await callClaude(prompt, apiKey)
    const parsed = parseJson<Entity[]>(raw)
    if (!parsed) return []
    return parsed.filter((e) => e.confidence >= 0.75 && e.name && e.type)
  } catch (err) {
    console.warn(`  Entity extraction failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

// ─── Pass 2: Relationship extraction ────────────────────────────────────────

async function extractRelationships(
  text: string,
  entityNames: string[],
  apiKey: string
): Promise<Relationship[]> {
  if (entityNames.length < 2) return []

  const prompt = `You are extracting semantic relationships between entities in a document about ${CLIENT_NAME}.

Known entities present: ${entityNames.join(', ')}
Also treat "${CLIENT_NAME}" as an entity.

For pairs of entities that have a clear relationship in the text, output the relationship using ONLY these types:
- WORKS_FOR: person is employed by or works for an organisation
- MANAGES: person manages/supervises another person
- CONSULTS_FOR: external consultant advises a client organisation
- COMPETES_WITH: organisation competes with another
- USES: entity uses or integrates another entity/technology
- HAS_COMPONENT: product has a sub-component or module
- PART_OF: something is a part of a larger system
- DEPENDS_ON: entity depends on another to function
- RELATES_TO: only if no other type fits (last resort)

IMPORTANT:
- "from" and "to" must be EXACT names from the entity list or "${CLIENT_NAME}"
- Nicolas Sakr CONSULTS_FOR ${CLIENT_NAME}
- Do NOT invent relationships that are not clearly supported by the text
- Minimum confidence 0.75
- Only output relationships where BOTH entities appear in the text

Return a JSON array ONLY:
[{"from": "EntityA", "to": "EntityB", "type": "RELATIONSHIP_TYPE", "confidence": 0.0-1.0}]

Text:
${text.slice(0, 3500)}

JSON array:`

  try {
    const raw = await callClaude(prompt, apiKey, 1024)
    const parsed = parseJson<Relationship[]>(raw)
    if (!parsed) return []
    const allNames = new Set([...entityNames, CLIENT_NAME])
    return parsed.filter(
      (r) => r.confidence >= 0.75 && r.from && r.to && r.type &&
             allNames.has(r.from) && allNames.has(r.to) && r.from !== r.to
    )
  } catch (err) {
    console.warn(`  Relationship extraction failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

// ─── Neo4j helpers ───────────────────────────────────────────────────────────

const TYPE_TO_LABEL: Record<string, NodeLabel> = {
  Person: 'Person',
  Organization: 'Competitor',   // Use Competitor for external orgs
  Product: 'Technology',        // Products stored as Technology
  Technology: 'Technology',
  Process: 'Process',
  Concept: 'Concept',
  Competitor: 'Competitor',
  Industry: 'Industry',
}

function nodeId(name: string, type: string): string {
  const normalised = name.toLowerCase().replace(/[^a-z0-9]/g, '_')
  const typeKey = type.toLowerCase()
  return `${CLIENT_ID}_${typeKey}_${normalised}`
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1) }

  const neo4j = new Neo4jClient()
  if (!neo4j.isAvailable()) { console.error('Neo4j unavailable'); process.exit(1) }
  const graphOps = new GraphOperations(neo4j)
  console.log('Neo4j connected.\n')

  // ── Step 0: Wipe all non-Client nodes and all relationships for this client ──
  console.log('Wiping existing entity nodes (keeping Client node)...')
  await neo4j.write(
    `MATCH (n) WHERE n.id STARTS WITH $prefix AND NOT (n:Client AND n.id = $clientId) DETACH DELETE n`,
    { prefix: `${CLIENT_ID}_`, clientId: CLIENT_ID }
  )
  // Also remove any stray duplicate client nodes
  await neo4j.write(
    `MATCH (n:Client) WHERE n.id = $clientId WITH n MATCH (n)-[r]-() DELETE r`,
    { clientId: CLIENT_ID }
  )
  console.log('Wiped.\n')

  // ── Step 1: Hard-code known people from email data ───────────────────────
  console.log('Adding known people from email/meeting data...')
  const knownPeople: Array<{ name: string; role: string; relationship: string }> = [
    { name: 'Marwan Meroue',  role: 'CEO',             relationship: 'WORKS_FOR' },
    { name: 'Paul Khoury',    role: 'Team member',      relationship: 'WORKS_FOR' },
    { name: 'Sean Hannah',    role: 'Team member',      relationship: 'WORKS_FOR' },
    { name: 'Jack Wade',      role: 'Team member',      relationship: 'WORKS_FOR' },
    { name: 'Nicolas Sakr',   role: 'Consultant/Advisor', relationship: 'CONSULTS_FOR' },
  ]

  for (const person of knownPeople) {
    const id = nodeId(person.name, 'person')
    await graphOps.upsertNode('Person', { id, name: person.name, role: person.role, sourceDocIds: [] })
    await neo4j.write(
      `MATCH (a {id: $fromId}), (b:Client {id: $toId})
       MERGE (a)-[:${person.relationship}]->(b)`,
      { fromId: id, toId: CLIENT_ID }
    )
    console.log(`  ${person.name} — ${person.relationship} ${CLIENT_NAME}`)
  }

  // Marwan MANAGES the team
  const managesPairs = [
    ['Marwan Meroue', 'Paul Khoury'],
    ['Marwan Meroue', 'Sean Hannah'],
    ['Marwan Meroue', 'Jack Wade'],
  ]
  for (const [from, to] of managesPairs) {
    if (!from || !to) continue
    await neo4j.write(
      `MATCH (a {id: $fromId}), (b {id: $toId})
       MERGE (a)-[:MANAGES]->(b)`,
      { fromId: nodeId(from, 'person'), toId: nodeId(to, 'person') }
    )
  }
  console.log('  Marwan MANAGES Paul, Sean, Jack\n')

  // ── Step 2: Load all document chunks ────────────────────────────────────
  const docs = await prisma.knowledgeDocument.findMany({
    where: { clientId: CLIENT_ID },
    include: { chunks: { orderBy: { chunkIndex: 'asc' }, select: { content: true } } },
  })
  console.log(`Loaded ${docs.length} documents with ${docs.reduce((a, d) => a + d.chunks.length, 0)} total chunks.\n`)

  // ── Step 3: Pass 1 — extract entities from each document ────────────────
  console.log('=== PASS 1: Entity Extraction ===')
  const entityMap = new Map<string, Entity>() // name → best entity

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!
    const text = doc.chunks.map((c) => c.content).join('\n\n')
    if (text.trim().length < 50) continue

    process.stdout.write(`[${i + 1}/${docs.length}] "${(doc.title ?? '').slice(0, 60)}" ... `)
    const entities = await extractEntities(text, apiKey)

    for (const e of entities) {
      const existing = entityMap.get(e.name)
      if (!existing || e.confidence > existing.confidence) {
        entityMap.set(e.name, e)
      }
    }
    console.log(`${entities.length} entities`)
    if (i < docs.length - 1) await new Promise((r) => setTimeout(r, 400))
  }

  console.log(`\nDeduped entity list (${entityMap.size} unique):`)
  for (const [name, e] of entityMap) {
    console.log(`  ${e.type}: ${name}${e.role ? ` (${e.role})` : ''}`)
  }

  // ── Step 4: Store entities to Neo4j ─────────────────────────────────────
  console.log('\nStoring entities...')
  for (const [, entity] of entityMap) {
    const label = TYPE_TO_LABEL[entity.type]
    if (!label) continue
    const id = nodeId(entity.name, entity.type.toLowerCase())
    try {
      await graphOps.upsertNode(label, {
        id,
        name: entity.name,
        role: entity.role ?? '',
        sourceDocIds: [],
      })
    } catch (err) {
      console.warn(`  Skipped ${entity.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.log(`Stored ${entityMap.size} entities.\n`)

  // ── Step 5: Pass 2 — extract relationships per document ─────────────────
  console.log('=== PASS 2: Relationship Extraction ===')
  const allEntityNames = Array.from(entityMap.keys())
  const relSet = new Set<string>() // dedup key
  let relCount = 0

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!
    const text = doc.chunks.map((c) => c.content).join('\n\n')
    if (text.trim().length < 50) continue

    // Only pass entities that appear in this doc's text (rough check)
    const relevantEntities = allEntityNames.filter((name) =>
      text.toLowerCase().includes(name.toLowerCase().split(' ')[0]!)
    )
    if (relevantEntities.length < 2) continue

    process.stdout.write(`[${i + 1}/${docs.length}] "${(doc.title ?? '').slice(0, 60)}" (${relevantEntities.length} entities) ... `)
    const rels = await extractRelationships(text, relevantEntities, apiKey)

    for (const rel of rels) {
      const key = `${rel.from}|${rel.to}|${rel.type}`
      if (relSet.has(key)) continue
      relSet.add(key)

      // Resolve IDs — check known people first, then entity map
      const fromEntity = entityMap.get(rel.from)
      const toEntity = entityMap.get(rel.to)

      // Find person IDs (could be hardcoded)
      const knownPersonNames = knownPeople.map((p) => p.name)
      const getEntityId = (name: string): string | null => {
        if (name === CLIENT_NAME) return CLIENT_ID
        const e = entityMap.get(name)
        if (e) return nodeId(name, e.type.toLowerCase())
        if (knownPersonNames.includes(name)) return nodeId(name, 'person')
        return null
      }

      const fromId = getEntityId(rel.from)
      const toId = getEntityId(rel.to)
      if (!fromId || !toId) continue

      try {
        await neo4j.write(
          `MATCH (a {id: $fromId}), (b {id: $toId})
           MERGE (a)-[:${rel.type}]->(b)`,
          { fromId, toId }
        )
        relCount++
      } catch (err) {
        console.warn(`\n  Rel skip ${rel.from} -${rel.type}-> ${rel.to}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log(`${rels.length} relationships`)
    if (i < docs.length - 1) await new Promise((r) => setTimeout(r, 400))
  }

  // ── Step 6: Hard-code key product relationships ──────────────────────────
  console.log('\nAdding hard-coded product structure...')

  // Aura Platform components
  const platformComponents = [
    'Weather Library', 'Market Library', 'Supply & Demand Board',
    'Aura Academy', 'Risk Signal Display', 'WASDE Tool',
  ]
  const platformId = nodeId('Aura Platform', 'product')

  // Ensure Aura Platform is stored as Technology
  await graphOps.upsertNode('Technology', {
    id: platformId,
    name: 'Aura Platform',
    role: 'Main product platform',
    sourceDocIds: [],
  })
  await neo4j.write(
    `MATCH (a {id: $fromId}), (b:Client {id: $toId}) MERGE (a)-[:PART_OF]->(b)`,
    { fromId: platformId, toId: CLIENT_ID }
  )

  for (const comp of platformComponents) {
    const existing = entityMap.get(comp)
    if (!existing) continue
    const compId = nodeId(comp, existing.type.toLowerCase())
    await neo4j.write(
      `MATCH (a {id: $fromId}), (b {id: $toId}) MERGE (a)-[:HAS_COMPONENT]->(b)`,
      { fromId: platformId, toId: compId }
    )
    console.log(`  Aura Platform HAS_COMPONENT ${comp}`)
  }

  // Weather Library uses weather models
  const weatherLibId = nodeId('Weather Library', 'technology')
  for (const model of ['GFS', 'ECM', 'NDVI']) {
    const modelEntity = entityMap.get(model)
    if (!modelEntity) continue
    const modelId = nodeId(model, modelEntity.type.toLowerCase())
    await neo4j.write(
      `MATCH (a {id: $fromId}), (b {id: $toId}) MERGE (a)-[:USES]->(b)`,
      { fromId: weatherLibId, toId: modelId }
    )
    console.log(`  Weather Library USES ${model}`)
  }

  await neo4j.close()
  console.log(`\n✓ Done. ${entityMap.size} entities + ${relCount} LLM-extracted relationships + hard-coded structure.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => void prisma.$disconnect())
