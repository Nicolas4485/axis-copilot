// Graph operations — upsertNode, upsertRelationship, findRelated,
// findPath, getClientSubgraph, detectConflicts, mergeNodes, toReadableText

import type { Integer } from 'neo4j-driver'
import { Neo4jClient } from './client.js'
import type {
  NodeLabel,
  RelationshipType,
  GraphNode,
  GraphRelationship,
  BaseNode,
  BaseRelationship,
  NodeWithRelationships,
  GraphPath,
  Subgraph,
  GraphConflict,
} from './schema.js'

/** Properties bag for creating/updating nodes */
export type NodeProperties = Omit<BaseNode, 'createdAt' | 'updatedAt'> & {
  [key: string]: unknown
}

/** Properties bag for creating/updating relationships */
export type RelationshipProperties = Omit<BaseRelationship, 'type'> & {
  [key: string]: unknown
}

/** Detail view for a single entity — direct relationships + source doc provenance */
export interface EntityDetails {
  id: string
  name: string
  label: string
  sourceDocIds: string[]
  relationships: Array<{
    type: string
    direction: 'outbound' | 'inbound'
    other: { id: string; name: string; label: string }
  }>
}

/**
 * Graph operations backed by Neo4j.
 *
 * All methods return null when Neo4j is unavailable (graceful degradation).
 * Never crash the API — the system falls back to vector-only RAG.
 */
export class GraphOperations {
  private client: Neo4jClient

  constructor(client: Neo4jClient) {
    this.client = client
  }

  /**
   * Create or update a node. Matches on id — if it exists, merges properties.
   * Sets createdAt on first create, always updates updatedAt.
   */
  async upsertNode(
    label: NodeLabel,
    properties: NodeProperties
  ): Promise<GraphNode | null> {
    const { id, ...rest } = properties
    const now = new Date().toISOString()

    // Build SET clause from properties
    const propEntries = Object.entries(rest)
    const setClauses = propEntries
      .map(([key]) => `n.${key} = $${key}`)
      .join(', ')

    const cypher = `
      MERGE (n:${label} {id: $id})
      ON CREATE SET n.createdAt = $now, n.updatedAt = $now, ${setClauses}
      ON MATCH SET n.updatedAt = $now, ${setClauses}
      RETURN n
    `

    const params: Record<string, unknown> = { id, now, ...rest }

    // Convert arrays to Neo4j-friendly format
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        params[key] = value
      }
    }

    const result = await this.client.write(cypher, params)
    if (!result || result.records.length === 0) return null

    const record = result.records[0]
    if (!record) return null
    return this.recordToNode(record.get('n'), label)
  }

  /**
   * Create or update a relationship between two nodes.
   * Matches on fromId + toId + type.
   */
  async upsertRelationship(
    relType: RelationshipType,
    properties: RelationshipProperties
  ): Promise<GraphRelationship | null> {
    const { fromId, toId, ...rest } = properties

    const propEntries = Object.entries(rest)
    const setClauses = propEntries.length > 0
      ? 'SET ' + propEntries.map(([key]) => `r.${key} = $${key}`).join(', ')
      : ''

    const cypher = `
      MATCH (a {id: $fromId}), (b {id: $toId})
      MERGE (a)-[r:${relType}]->(b)
      ${setClauses}
      RETURN r, a.id AS fromId, b.id AS toId
    `

    const params: Record<string, unknown> = { fromId, toId, ...rest }
    const result = await this.client.write(cypher, params)
    if (!result || result.records.length === 0) return null

    const record = result.records[0]
    if (!record) return null
    return this.recordToRelationship(record.get('r'), relType, fromId, toId)
  }

  /**
   * Find nodes related to a given node, up to a specified depth.
   * Returns the node with all its relationships and connected nodes.
   */
  async findRelated(
    nodeId: string,
    depth: number = 2,
    relTypes?: RelationshipType[]
  ): Promise<NodeWithRelationships | null> {
    const maxDepth = Math.min(depth, 4) // Cap at 4 for performance

    // Backtick-escape each type to handle multi-word labels (e.g. "user stories")
    const relFilter = relTypes && relTypes.length > 0
      ? `:${relTypes.map((t) => `\`${t}\``).join('|')}`
      : ''

    const cypher = `
      MATCH (root {id: $nodeId})
      OPTIONAL MATCH (root)-[r${relFilter}]-(related)
      WHERE length(shortestPath((root)-[*..${maxDepth}]-(related))) <= ${maxDepth}
      RETURN root, collect(DISTINCT {rel: r, node: related, relType: type(r)}) AS connections
    `

    const result = await this.client.query(cypher, { nodeId })
    if (!result || result.records.length === 0) return null

    const record = result.records[0]
    if (!record) return null
    const rootNode = this.recordToNode(record.get('root'), this.detectLabel(record.get('root')))
    const connections = record.get('connections') as Array<{
      rel: unknown
      node: unknown
      relType: string
    }>

    const relationships = connections
      .filter((c) => c.rel !== null && c.node !== null)
      .map((c) => ({
        relationship: this.recordToRelationship(
          c.rel,
          c.relType as RelationshipType,
          nodeId,
          this.extractId(c.node)
        ),
        targetNode: this.recordToNode(c.node, this.detectLabel(c.node)),
      }))

    return { node: rootNode, relationships }
  }

  /**
   * Find the shortest path between two nodes.
   */
  async findPath(
    fromId: string,
    toId: string,
    maxLength: number = 5
  ): Promise<GraphPath | null> {
    const cypher = `
      MATCH p = shortestPath((a {id: $fromId})-[*..${Math.min(maxLength, 10)}]-(b {id: $toId}))
      RETURN nodes(p) AS nodes, relationships(p) AS rels, length(p) AS pathLength
    `

    const result = await this.client.query(cypher, { fromId, toId })
    if (!result || result.records.length === 0) return null

    const record = result.records[0]
    if (!record) return null
    const nodes = (record.get('nodes') as unknown[]).map(
      (n) => this.recordToNode(n, this.detectLabel(n))
    )
    const rels = (record.get('rels') as unknown[]).map(
      (r, i) => this.recordToRelationship(
        r,
        this.extractRelType(r),
        nodes[i]?.id ?? '',
        nodes[i + 1]?.id ?? ''
      )
    )
    const pathLength = record.get('pathLength')
    const length = typeof pathLength === 'object' && pathLength !== null && 'toNumber' in pathLength
      ? (pathLength as Integer).toNumber()
      : Number(pathLength)

    return { nodes, relationships: rels, length }
  }

  /**
   * Get the full subgraph for a client — all nodes and relationships
   * belonging to this client.
   *
   * Nodes are identified by clientId prefix in their id: `${clientId}_*`.
   * This covers all existing data without requiring a migration.
   */
  async getClientSubgraph(clientId: string): Promise<Subgraph | null> {
    const prefix = `${clientId}_`
    // Include the Client node itself (id = clientId, no underscore suffix)
    // AND all prefixed entity nodes. A relationship is included when EITHER
    // endpoint matches — this makes relationships to/from the Client node visible.
    const cypher = `
      MATCH (n)
      WHERE n.id STARTS WITH $prefix OR n.id = $clientId
      OPTIONAL MATCH (a)-[r]->(b)
      WHERE (a.id STARTS WITH $prefix OR a.id = $clientId)
        AND (b.id STARTS WITH $prefix OR b.id = $clientId)
      RETURN collect(DISTINCT n) AS nodes,
             collect(DISTINCT {relType: type(r), fromId: a.id, toId: b.id}) AS rels
    `

    const result = await this.client.query(cypher, { prefix, clientId })
    if (!result || result.records.length === 0) return null

    const record = result.records[0]
    if (!record) return null

    const rawNodes = record.get('nodes') as unknown[]
    const rawRels  = record.get('rels')  as Array<{ relType: string; fromId: string; toId: string } | null>

    if (rawNodes.length === 0) return null

    const nodes: GraphNode[] = []
    for (const n of rawNodes) {
      if (n !== null) {
        nodes.push(this.recordToNode(n, this.detectLabel(n)))
      }
    }

    const relationships: GraphRelationship[] = []
    for (const r of rawRels) {
      if (r !== null && r.fromId && r.toId) {
        relationships.push({
          type: r.relType as RelationshipType,
          fromId: r.fromId,
          toId: r.toId,
        } as GraphRelationship)
      }
    }

    return { nodes, relationships }
  }

  /**
   * Detect conflicting information in the graph.
   * Looks for CONFLICTS_WITH relationships and nodes with the same name
   * but different property values.
   */
  async detectConflicts(clientId?: string): Promise<GraphConflict[]> {
    // Always scope conflicts to avoid cross-client data leakage.
    // When clientId is provided: return conflicts where both nodes belong to that client.
    // When clientId is null: return conflicts where both nodes are unscoped (no client).
    const clientFilter = clientId
      ? 'WHERE a.clientId = $clientId AND b.clientId = $clientId'
      : 'WHERE a.clientId IS NULL AND b.clientId IS NULL'

    const cypher = `
      MATCH (a)-[r:CONFLICTS_WITH]->(b)
      ${clientFilter}
      RETURN a, b, r
    `

    const params: Record<string, unknown> = clientId ? { clientId } : {}
    const result = await this.client.query(cypher, params)
    if (!result) return []

    return result.records.map((record) => {
      const nodeA = this.recordToNode(record.get('a'), this.detectLabel(record.get('a')))
      const nodeB = this.recordToNode(record.get('b'), this.detectLabel(record.get('b')))
      const rel = record.get('r') as Record<string, unknown>
      const reason = (rel && typeof rel === 'object' && 'properties' in rel)
        ? ((rel as { properties: Record<string, unknown> }).properties['reason'] as string) ?? ''
        : ''

      return {
        nodeA,
        nodeB,
        property: reason,
        valueA: nodeA.name,
        valueB: nodeB.name,
        relationship: this.recordToRelationship(
          record.get('r'),
          'CONFLICTS_WITH',
          nodeA.id,
          nodeB.id
        ),
      }
    })
  }

  /**
   * Merge two nodes into one, transferring all relationships.
   * The surviving node keeps its properties; the merged node is deleted.
   */
  async mergeNodes(
    survivorId: string,
    mergedId: string
  ): Promise<GraphNode | null> {
    const cypher = `
      MATCH (survivor {id: $survivorId}), (merged {id: $mergedId})
      CALL {
        WITH survivor, merged
        MATCH (merged)-[r]->(target)
        WHERE target <> survivor
        WITH survivor, type(r) AS relType, properties(r) AS relProps, target
        CALL apoc.create.relationship(survivor, relType, relProps, target) YIELD rel
        RETURN count(rel) AS outCount
      }
      CALL {
        WITH survivor, merged
        MATCH (source)-[r]->(merged)
        WHERE source <> survivor
        WITH survivor, type(r) AS relType, properties(r) AS relProps, source
        CALL apoc.create.relationship(source, relType, relProps, survivor) YIELD rel
        RETURN count(rel) AS inCount
      }
      WITH survivor, merged
      SET survivor.sourceDocIds = survivor.sourceDocIds + merged.sourceDocIds,
          survivor.updatedAt = $now
      DETACH DELETE merged
      RETURN survivor
    `

    const result = await this.client.write(cypher, {
      survivorId,
      mergedId,
      now: new Date().toISOString(),
    })
    if (!result || result.records.length === 0) return null

    const record = result.records[0]
    if (!record) return null
    return this.recordToNode(record.get('survivor'), this.detectLabel(record.get('survivor')))
  }

  /**
   * Convert a subgraph to human-readable text for inclusion in agent context.
   * Produces a structured description suitable for LLM consumption.
   */
  toReadableText(subgraph: Subgraph): string {
    if (subgraph.nodes.length === 0) return 'No graph context available.'

    const lines: string[] = ['KNOWLEDGE GRAPH CONTEXT:', '']

    // Group nodes by label
    const grouped = new Map<string, GraphNode[]>()
    for (const node of subgraph.nodes) {
      const label = 'label' in node ? (node as { label: string }).label : 'Unknown'
      const existing = grouped.get(label)
      if (existing) {
        existing.push(node)
      } else {
        grouped.set(label, [node])
      }
    }

    for (const [label, nodes] of grouped) {
      lines.push(`${label}s:`)
      for (const node of nodes) {
        const props = this.nodeToProps(node)
        lines.push(`  - ${node.name} ${props}`)
      }
      lines.push('')
    }

    if (subgraph.relationships.length > 0) {
      lines.push('Relationships:')
      for (const rel of subgraph.relationships) {
        const props = this.relToProps(rel)
        lines.push(`  - [${rel.fromId}] -${rel.type}-> [${rel.toId}] ${props}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Get direct relationships and source provenance for a single entity node.
   * Used to populate the entity detail panel in the knowledge graph UI.
   */
  async getEntityDetails(entityId: string): Promise<EntityDetails | null> {
    // Two-pass: collect outbound rels with WITH, then collect inbound rels.
    // Avoids cartesian product that would arise from two OPTIONAL MATCHes in one block.
    const cypher = `
      MATCH (n {id: $entityId})
      OPTIONAL MATCH (n)-[outR]->(outNode)
      WITH n,
           collect(DISTINCT {
             relType:    type(outR),
             otherId:    outNode.id,
             otherName:  outNode.name,
             otherLabel: labels(outNode)[0]
           }) AS outRels
      OPTIONAL MATCH (n)<-[inR]-(inNode)
      RETURN
        n.id            AS id,
        n.name          AS name,
        labels(n)[0]    AS label,
        n.sourceDocIds  AS sourceDocIds,
        outRels,
        collect(DISTINCT {
          relType:    type(inR),
          otherId:    inNode.id,
          otherName:  inNode.name,
          otherLabel: labels(inNode)[0]
        }) AS inRels
    `

    const result = await this.client.query(cypher, { entityId })
    if (!result || result.records.length === 0) return null

    const record = result.records[0]
    if (!record) return null

    type RawRel = { relType: string | null; otherId: string | null; otherName: string | null; otherLabel: string | null }

    const outRels = (record.get('outRels') as RawRel[])
      .filter((r) => r.otherId !== null)
      .map((r) => ({
        type:      r.relType ?? 'RELATES_TO',
        direction: 'outbound' as const,
        other: {
          id:    r.otherId!,
          name:  r.otherName ?? r.otherId!,
          label: r.otherLabel ?? 'Concept',
        },
      }))

    const inRels = (record.get('inRels') as RawRel[])
      .filter((r) => r.otherId !== null)
      .map((r) => ({
        type:      r.relType ?? 'RELATES_TO',
        direction: 'inbound' as const,
        other: {
          id:    r.otherId!,
          name:  r.otherName ?? r.otherId!,
          label: r.otherLabel ?? 'Concept',
        },
      }))

    const rawSourceDocIds = record.get('sourceDocIds')
    const sourceDocIds = Array.isArray(rawSourceDocIds) ? (rawSourceDocIds as string[]) : []

    return {
      id:           record.get('id') as string,
      name:         (record.get('name') as string | null) ?? '',
      label:        (record.get('label') as string | null) ?? 'Concept',
      sourceDocIds,
      relationships: [...outRels, ...inRels],
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────

  /** Convert a Neo4j record node to a typed GraphNode */
  private recordToNode(raw: unknown, label: NodeLabel): GraphNode {
    const props = this.extractProperties(raw)
    return {
      label,
      id: (props['id'] as string) ?? '',
      name: (props['name'] as string) ?? '',
      createdAt: (props['createdAt'] as string) ?? '',
      updatedAt: (props['updatedAt'] as string) ?? '',
      sourceDocIds: (props['sourceDocIds'] as string[]) ?? [],
      ...props,
    } as GraphNode
  }

  /** Convert a Neo4j record relationship to a typed GraphRelationship */
  private recordToRelationship(
    raw: unknown,
    relType: RelationshipType,
    fromId: string,
    toId: string
  ): GraphRelationship {
    const props = this.extractProperties(raw)
    return {
      type: relType,
      fromId,
      toId,
      ...props,
    } as GraphRelationship
  }

  /** Extract properties from a Neo4j node/relationship object */
  private extractProperties(raw: unknown): Record<string, unknown> {
    if (raw === null || raw === undefined) return {}
    if (typeof raw === 'object' && 'properties' in raw) {
      return (raw as { properties: Record<string, unknown> }).properties
    }
    if (typeof raw === 'object') {
      return raw as Record<string, unknown>
    }
    return {}
  }

  /** Detect the label of a Neo4j node from its labels array */
  private detectLabel(raw: unknown): NodeLabel {
    if (raw === null || raw === undefined) return 'Concept'
    if (typeof raw === 'object' && 'labels' in raw) {
      const labels = (raw as { labels: string[] }).labels
      const first = labels[0]
      if (first) return first as NodeLabel
    }
    return 'Concept'
  }

  /** Extract the id property from a raw Neo4j node */
  private extractId(raw: unknown): string {
    const props = this.extractProperties(raw)
    return (props['id'] as string) ?? ''
  }

  /** Extract relationship type from a raw Neo4j relationship */
  private extractRelType(raw: unknown): RelationshipType {
    if (raw === null || raw === undefined) return 'DEPENDS_ON'
    if (typeof raw === 'object' && 'type' in raw) {
      return (raw as { type: string }).type as RelationshipType
    }
    return 'DEPENDS_ON'
  }

  /** Format node properties for readable text */
  private nodeToProps(node: GraphNode): string {
    const skip = new Set(['id', 'name', 'label', 'createdAt', 'updatedAt', 'sourceDocIds'])
    const entries = Object.entries(node)
      .filter(([key]) => !skip.has(key))
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${key}: ${String(value)}`)
    return entries.length > 0 ? `(${entries.join(', ')})` : ''
  }

  /** Format relationship properties for readable text */
  private relToProps(rel: GraphRelationship): string {
    const skip = new Set(['type', 'fromId', 'toId'])
    const entries = Object.entries(rel)
      .filter(([key]) => !skip.has(key))
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${key}: ${String(value)}`)
    return entries.length > 0 ? `{${entries.join(', ')}}` : ''
  }
}
