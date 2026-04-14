/**
 * One-time entity backfill script.
 *
 * Reads existing document chunks for the Aura Commodities client from Postgres,
 * runs entity extraction via Claude Haiku, and stores the results in Neo4j.
 *
 * Run AFTER cleanup-junk-docs.ts:
 *   cd apps/api && npx tsx src/scripts/backfill-entities.ts
 */

import { PrismaClient } from '@prisma/client'
import { Neo4jClient, GraphOperations } from '@axis/knowledge-graph'
import type { NodeLabel } from '@axis/knowledge-graph'

const prisma = new PrismaClient()

const ENTITY_TYPE_TO_LABEL: Record<string, NodeLabel> = {
  CLIENT: 'Client',
  COMPETITOR: 'Competitor',
  TECHNOLOGY: 'Technology',
  PERSON: 'Person',
  PROCESS: 'Process',
  INDUSTRY: 'Industry',
  CONCEPT: 'Concept',
}

interface ExtractedRaw {
  name: string
  type: string
  properties: Record<string, unknown>
  confidence: number
}

interface AnthropicContent {
  type: string
  text?: string
}

interface AnthropicResponse {
  content: AnthropicContent[]
}

async function extractEntities(text: string, apiKey: string): Promise<ExtractedRaw[]> {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Extract named entities from this text about Aura Commodities. Return a JSON array only, no prose.

Each item: { "name": string, "type": "CLIENT|COMPETITOR|TECHNOLOGY|PERSON|PROCESS|INDUSTRY|CONCEPT", "properties": {}, "confidence": 0.0-1.0 }

Only extract entities with confidence >= 0.6. Focus on people (name, role), companies, technologies, and processes relevant to a commodities trading consultancy.

Text:
${text.slice(0, 3000)}

Return JSON array:`,
        }],
      }),
    })

    if (!resp.ok) {
      console.warn(`  Anthropic API error: ${resp.status}`)
      return []
    }

    const data = await resp.json() as AnthropicResponse
    const raw = data.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')

    const match = raw.match(/\[[\s\S]*\]/)
    if (!match?.[0]) return []

    const parsed = JSON.parse(match[0]) as ExtractedRaw[]
    return parsed.filter((e) => e.confidence >= 0.6 && e.name && e.type)
  } catch (err) {
    console.warn(`  Entity extraction failed: ${err instanceof Error ? err.message : 'Unknown'}`)
    return []
  }
}

async function main(): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set. Cannot run entity extraction.')
    process.exit(1)
  }

  // Check Neo4j
  const neo4j = new Neo4jClient()
  if (!neo4j.isAvailable()) {
    console.error('Neo4j is not available. Is it running? Check NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD in .env')
    await prisma.$disconnect()
    process.exit(1)
  }
  const graphOps = new GraphOperations(neo4j)
  console.log('Neo4j connected.')

  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!user) { console.log('No users found.'); return }

  const auraClient = await prisma.client.findFirst({
    where: { name: 'Aura Commodities', userId: user.id },
  })
  if (!auraClient) { console.log('Aura Commodities client not found.'); return }

  const docs = await prisma.knowledgeDocument.findMany({
    where: { clientId: auraClient.id },
    include: {
      chunks: {
        orderBy: { chunkIndex: 'asc' },
        take: 5, // First 5 chunks per doc to limit API cost
        select: { content: true },
      },
    },
  })

  console.log(`Processing ${docs.length} documents for Aura Commodities (${auraClient.id})`)

  let totalEntities = 0
  let totalNodes = 0

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!
    const combinedText = doc.chunks.map((c) => c.content).join('\n\n')
    if (combinedText.trim().length < 50) continue

    process.stdout.write(`[${i + 1}/${docs.length}] "${(doc.title ?? '').slice(0, 60)}" ... `)

    const entities = await extractEntities(combinedText, apiKey)
    totalEntities += entities.length

    for (const entity of entities) {
      const label = ENTITY_TYPE_TO_LABEL[entity.type.toUpperCase()]
      if (!label) continue

      const normalised = entity.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
      const nodeId = `${auraClient.id}_${entity.type.toLowerCase()}_${normalised}`

      try {
        await graphOps.upsertNode(label, {
          id: nodeId,
          name: entity.name,
          sourceDocIds: [doc.id],
          ...entity.properties,
        })
        totalNodes++
      } catch (err) {
        console.warn(`\n  Skipped "${entity.name}": ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }

    console.log(`${entities.length} entities`)

    // Avoid API rate limits
    if (i < docs.length - 1) await new Promise((r) => setTimeout(r, 300))
  }

  await neo4j.close()
  console.log(`\nDone. Extracted ${totalEntities} entities, stored ${totalNodes} graph nodes.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => void prisma.$disconnect())
