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

    const relFilter = relTypes && relTypes.length > 0
      ? `:${relTypes.join('|')}`
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
   * connected to the client node within 3 hops.
   */
  async getClientSubgraph(clientId: string): Promise<Subgraph | null> {
    const cypher = `
      MATCH (client:Client {id: $clientId})
      OPTIONAL MATCH path = (client)-[*..3]-(related)
      WITH client, collect(DISTINCT related) AS relatedNodes,
           collect(DISTINCT relationships(path)) AS allRelPaths
      UNWIND relatedNodes AS node
      OPTIONAL MATCH (node)-[r]-(other)
      WHERE other IN relatedNodes OR other = client
      RETURN client,
             collect(DISTINCT node) AS nodes,
             collect(DISTINCT r) AS relationships
    `

    const result = await this.client.query(cypher, { clientId })
    if (!result || result.records.length === 0) return null

    const record = result.records[0]
    if (!record) return null
    const clientNode = this.recordToNode(record.get('client'), 'Client')
    const rawNodes = record.get('nodes') as unknown[]
    const rawRels = record.get('relationships') as unknown[]

    const nodes: GraphNode[] = [clientNode]
    for (const n of rawNodes) {
      if (n !== null) {
        nodes.push(this.recordToNode(n, this.detectLabel(n)))
      }
    }

    const relationships: GraphRelationship[] = []
    for (const r of rawRels) {
      if (r !== null) {
        relationships.push(
          this.recordToRelationship(r, this.extractRelType(r), '', '')
        )
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
    const clientFilter = clientId
      ? 'WHERE a.clientId = $clientId OR b.clientId = $clientId'
      : ''

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
